import type { JsonAction, JsonIndent, JsonResult } from "./json-core";

export interface JsonWorkerRequest {
  id: number;
  action: JsonAction;
  input: string;
  indent: JsonIndent;
}

export interface JsonWorkerResponse {
  id: number;
  result: JsonResult;
}
