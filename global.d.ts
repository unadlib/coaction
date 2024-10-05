export {};

declare var __DEV__: boolean;

declare global {
  var SharedWorkerGlobalScope: any;
  var WorkerGlobalScope: any;
  var name: string;
}
