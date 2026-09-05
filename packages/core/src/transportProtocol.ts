import type { Patches } from './patch';
import {
  assertSharedJsonValue,
  decodeSharedJson,
  encodeSharedJson
} from './sharedState';
import type { JsonValue } from './jsonTypes';
import { isUnsafePathSegment } from './utils';

export const transportProtocolVersion = 1 as const;

type JsonRecord = { [key: string]: JsonValue };

export type ExecuteRequest = {
  action: string[];
  args: JsonValue[];
};

export type ExecuteResponse = {
  epoch: string;
  sequence: number;
} & ({ ok: true; value?: JsonValue } | { error: string; ok: false });

export type FullSyncResponse = {
  epoch: string;
  sequence: number;
  state: JsonRecord;
};

export type WirePatch =
  | { op: 'remove'; path: Array<number | string> }
  | {
      op: 'add' | 'replace';
      path: Array<number | string>;
      value: JsonValue;
    };

export type UpdateMessage = {
  epoch: string;
  patches: WirePatch[];
  sequence: number;
};

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

const asRecord = (value: JsonValue, message: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(message);
  }
  return value;
};

const decodeMessage = (encoded: unknown, type: string) => {
  const message = asRecord(
    decodeSharedJson(encoded),
    'Invalid transport message'
  );
  if (message.v !== transportProtocolVersion || message.type !== type) {
    throw new TypeError('Invalid transport message');
  }
  return message;
};

const readEpoch = (message: JsonRecord) => {
  if (typeof message.epoch !== 'string' || message.epoch.length === 0) {
    throw new TypeError('Invalid transport epoch');
  }
  return message.epoch;
};

const readSequence = (message: JsonRecord) => {
  if (
    typeof message.sequence !== 'number' ||
    !Number.isSafeInteger(message.sequence) ||
    message.sequence < 0
  ) {
    throw new TypeError('Invalid transport sequence');
  }
  return message.sequence;
};

const readAction = (value: JsonValue) => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((key) => typeof key !== 'string' || isUnsafePathSegment(key))
  ) {
    throw new TypeError('Invalid transport action');
  }
  return [...value] as string[];
};

const readPath = (
  value: JsonValue,
  { allowUnsafe = false }: { allowUnsafe?: boolean } = {}
) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('Invalid transport patch path');
  }
  const path: Array<number | string> = [];
  for (const segment of value) {
    if (
      (typeof segment !== 'string' &&
        (typeof segment !== 'number' ||
          !Number.isSafeInteger(segment) ||
          segment < 0)) ||
      (!allowUnsafe && isUnsafePathSegment(segment))
    ) {
      throw new TypeError('Invalid transport patch path');
    }
    path.push(segment);
  }
  return path;
};

const readPatches = (
  value: JsonValue,
  options: { allowUnsafePaths?: boolean } = {}
) => {
  if (!Array.isArray(value)) {
    throw new TypeError('Invalid transport patches');
  }
  return value.map((candidate): WirePatch => {
    const patch = asRecord(candidate, 'Invalid transport patch');
    const path = readPath(patch.path, {
      allowUnsafe: options.allowUnsafePaths
    });
    if (patch.op === 'remove') {
      if (hasOwn(patch, 'value')) {
        throw new TypeError('Invalid remove patch');
      }
      return { op: 'remove', path };
    }
    if (
      (patch.op !== 'add' && patch.op !== 'replace') ||
      !hasOwn(patch, 'value')
    ) {
      throw new TypeError('Invalid transport patch');
    }
    return { op: patch.op, path, value: patch.value };
  });
};

export const validateUpdatePatches = (patches: Patches) => {
  assertSharedJsonValue(patches);
  readPatches(patches as JsonValue, { allowUnsafePaths: true });
};

export const encodeExecuteRequest = (
  action: readonly string[],
  args: readonly unknown[]
) =>
  encodeSharedJson({
    action: readAction([...action] as JsonValue),
    args,
    type: 'execute',
    v: transportProtocolVersion
  });

export const decodeExecuteRequest = (encoded: unknown): ExecuteRequest => {
  const message = decodeMessage(encoded, 'execute');
  if (!Array.isArray(message.args)) {
    throw new TypeError('Invalid transport arguments');
  }
  return {
    action: readAction(message.action),
    args: [...message.args]
  };
};

export const encodeExecuteResponse = (response: ExecuteResponse) =>
  encodeSharedJson({
    ...response,
    type: 'execute-result',
    v: transportProtocolVersion
  });

export const decodeExecuteResponse = (encoded: unknown): ExecuteResponse => {
  const message = decodeMessage(encoded, 'execute-result');
  const base = { epoch: readEpoch(message), sequence: readSequence(message) };
  if (message.ok === true) {
    return hasOwn(message, 'value')
      ? { ...base, ok: true, value: message.value }
      : { ...base, ok: true };
  }
  if (
    message.ok !== false ||
    typeof message.error !== 'string' ||
    message.error.length === 0
  ) {
    throw new TypeError('Invalid execute response');
  }
  return { ...base, error: message.error, ok: false };
};

export const encodeFullSyncRequest = () =>
  encodeSharedJson({ type: 'full-sync', v: transportProtocolVersion });

export const decodeFullSyncRequest = (encoded: unknown) => {
  decodeMessage(encoded, 'full-sync');
};

export const encodeFullSyncResponse = (response: FullSyncResponse) =>
  encodeSharedJson({
    ...response,
    type: 'full-sync-result',
    v: transportProtocolVersion
  });

export const decodeFullSyncResponse = (encoded: unknown): FullSyncResponse => {
  const message = decodeMessage(encoded, 'full-sync-result');
  return {
    epoch: readEpoch(message),
    sequence: readSequence(message),
    state: asRecord(message.state, 'Invalid fullSync state')
  };
};

export const encodeUpdateMessage = (
  epoch: string,
  sequence: number,
  patches: Patches
) => {
  const wirePatches = readPatches(
    patches.map((patch) =>
      patch.op === 'remove'
        ? { op: patch.op, path: patch.path }
        : { op: patch.op, path: patch.path, value: patch.value }
    ) as JsonValue
  );
  return encodeSharedJson({
    epoch,
    patches: wirePatches,
    sequence,
    type: 'update',
    v: transportProtocolVersion
  });
};

export const decodeUpdateMessage = (encoded: unknown): UpdateMessage => {
  const message = decodeMessage(encoded, 'update');
  return {
    epoch: readEpoch(message),
    patches: readPatches(message.patches),
    sequence: readSequence(message)
  };
};
