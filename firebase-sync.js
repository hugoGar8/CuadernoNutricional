(function(){
  const settings = window.CUADERNO_FIREBASE_CONFIG;
  let docRef = null;
  let unsubscribe = null;
  let getState = null;
  let applyState = null;
  let onReady = null;
  let onRemoteChange = null;
  let onError = null;
  let lastRemoteUpdatedAt = 0;
  let deviceId = localStorage.getItem("cuadernoNutricional:deviceId");
  let applyingRemote = false;
  let readyNotified = false;

  if(!deviceId){
    deviceId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
    localStorage.setItem("cuadernoNutricional:deviceId", deviceId);
  }

  window.CuadernoCloudSync = {
    start(options){
      if(!settings?.enabled) return;
      if(!window.firebase || !settings.firebase?.projectId) return;

      getState = options.getState;
      applyState = options.applyState;
      onReady = options.onReady;
      onRemoteChange = options.onRemoteChange;
      onError = options.onError;

      try{
        firebase.initializeApp(settings.firebase);
        firebase.auth().signInAnonymously()
          .then(() => {
            const db = firebase.firestore();
            docRef = db.collection("cuadernos").doc(settings.notebookId || "mi-cuaderno");
            listen();
          })
          .catch((error) => onError?.(error));
      } catch(error){
        onError?.(error);
      }
    },
    save(state){
      if(!docRef || applyingRemote) return;
      const updatedAt = Date.now();
      lastRemoteUpdatedAt = updatedAt;
      docRef.set({
        updatedAt,
        deviceId,
        state
      }, {merge: true}).catch((error) => onError?.(error));
    }
  };

  function listen(){
    unsubscribe?.();
    unsubscribe = docRef.onSnapshot(async (snapshot) => {
      if(!snapshot.exists){
        window.CuadernoCloudSync.save(getState());
        notifyReady();
        return;
      }

      const data = snapshot.data();
      if(!data?.state) return;
      if(data.deviceId === deviceId || data.updatedAt <= lastRemoteUpdatedAt) {
        notifyReady();
        return;
      }

      applyingRemote = true;
      lastRemoteUpdatedAt = data.updatedAt || Date.now();
      try{
        await applyState(data.state);
        onRemoteChange?.();
      } catch(error){
        onError?.(error);
      } finally {
        applyingRemote = false;
      }
    }, (error) => onError?.(error));
  }

  function notifyReady(){
    if(readyNotified) return;
    readyNotified = true;
    onReady?.();
  }
})();
