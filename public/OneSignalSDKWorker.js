// Service worker requis par OneSignal Web Push — doit être servi tel quel
// depuis la racine du domaine (public/OneSignalSDKWorker.js -> /OneSignalSDKWorker.js).
// Ne fait qu'importer le vrai service worker OneSignal, comme documenté sur
// https://documentation.onesignal.com/docs/web-push-quickstart.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js')
