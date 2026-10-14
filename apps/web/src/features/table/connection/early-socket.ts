// Connexion ouverte avant l'hydratation : un script en ligne, exécuté pendant l'analyse
// du HTML, ouvre le WebSocket de la table et met de côté les premiers messages (dont
// l'état complet). React récupère la socket à l'hydratation : l'état arrive pendant que
// le JavaScript se charge, au lieu d'après.

export interface EarlySocket {
  code: string;
  ws: WebSocket;
  queue: ArrayBuffer[];
  /** Cesse de mettre les messages de côté (la connexion est reprise par l'application). */
  stop(): void;
}

declare global {
  interface Window {
    presidenteEarly?: EarlySocket;
  }
}

export function earlySocketScript(wsUrl: string): string {
  return `(function(){try{var m=location.pathname.match(/^\\/t\\/([A-Za-z0-9]{4,8})\\/?$/);if(!m)return;var c=m[1].toUpperCase();var ws=new WebSocket(${JSON.stringify(wsUrl)}+'/tables/'+c+'/ws?active='+(document.visibilityState==='visible'?1:0));ws.binaryType='arraybuffer';var q=[];var h=function(e){q.push(e.data)};ws.addEventListener('message',h);window.presidenteEarly={code:c,ws:ws,queue:q,stop:function(){ws.removeEventListener('message',h)}}}catch(e){}})()`;
}

/** Reprend la socket ouverte par le script en ligne, si elle concerne cette table. */
export function takeEarlySocket(code: string): EarlySocket | null {
  const early = typeof window === 'undefined' ? undefined : window.presidenteEarly;
  if (early === undefined || early.code !== code) return null;
  window.presidenteEarly = undefined;
  early.stop();
  if (early.ws.readyState === WebSocket.CLOSING || early.ws.readyState === WebSocket.CLOSED) return null;
  return early;
}
