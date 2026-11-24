import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { toAppError } from "@/utils/errors";

/** invoke() that always rejects with a normalized AppError. */
export async function call<T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  try {
    return await invoke<T>(command, args, options);
  } catch (err) {
    throw toAppError(err);
  }
}

/** For commands that return raw bytes via tauri::ipc::Response. */
export async function callBytes(command: string, args?: InvokeArgs): Promise<Uint8Array> {
  const data = await call<ArrayBuffer | number[]>(command, args);
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
}
