// Only the encryption/signing APIs used by the Worker; transport uses standard fetch.
declare module 'web-push' {
  interface Subscription { endpoint:string; keys:{p256dh:string;auth:string}; }
  interface VapidKeys { publicKey:string; privateKey:string; }
  const webpush: {
    generateVAPIDKeys():VapidKeys;
    generateRequestDetails(subscription:Subscription,payload:string,options:{TTL:number;contentEncoding:'aes128gcm';vapidDetails:VapidKeys&{subject:string}}):{endpoint:string;headers:Record<string,string|number>;body:Uint8Array};
  };
  export default webpush;
}
