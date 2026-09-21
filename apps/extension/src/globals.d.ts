/** JSON RPC payloads are validated by the SQLite command boundary. */
type DataRecord = Record<string, any>;
interface ContextSettings {
  aiApiKey: string;
  supadataApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
}
interface CardOptions {
  container: HTMLElement | ShadowRoot;
  resource: DataRecord;
  anchor: DataRecord;
  selected?: string;
  translation?: string;
  close?: () => void;
  pause?: (token: string) => void;
  resume?: (token: string) => void;
}
interface HTMLElement {
  dispose?: () => void;
  cleanup?: () => void;
  getSelection?: () => Selection | null;
}
interface ShadowRoot {
  getSelection?: () => Selection | null;
}
interface LearningClient {
  call: (message: DataRecord) => Promise<any>;
  api: (command: string, params?: DataRecord) => Promise<any>;
  el: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string | null,
    cls?: string,
  ) => HTMLElementTagNameMap[K];
  button: (
    label: string,
    handler: (event: MouseEvent) => unknown,
  ) => HTMLButtonElement;
  time: (seconds: number) => string;
  all: (command: string, params?: DataRecord) => Promise<DataRecord[]>;
  waitJob: (
    id: string,
    onStatus?: (status: string) => void,
  ) => Promise<DataRecord>;
  isCaption: (anchor: DataRecord) => boolean;
  captionFailure: (
    container: HTMLElement,
    message: string,
    retry: () => unknown,
    resource: DataRecord,
  ) => void;
  css: string;
  discussionCard: (options: CardOptions) => HTMLElement;
  clipboard: (
    text: string,
    container: HTMLElement | ShadowRoot,
  ) => Promise<boolean>;
}
declare var LC: LearningClient;
declare var CONTEXT_SETTINGS: {
  STORAGE_KEY: string;
  DEFAULTS: ContextSettings;
  normalize: (input?: unknown) => ContextSettings;
};
declare function getSettings(): Promise<ContextSettings>;
declare function requestAiCompletion(input: {
  messages: { role: string; content: string }[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; settings: ContextSettings }>;
declare function handleFetchTranscript(videoId: string): Promise<any>;
declare function handleTranslateContent(
  content: DataRecord,
  kind: string,
  language: string,
  title: string,
): Promise<any>;
declare function importScripts(...scripts: string[]): void;

declare var __lcPage: boolean | undefined;
