import { createContext, useContext } from "react";
import type { DropKindOption } from "@/components/drops/AddDropSheet";

/** Payload for opening the capture sheet pre-filled (e.g. from a share). */
export interface SharePayload {
  text?: string;
  url?: string;
  imageDataUrl?: string;
  fileName?: string;
  contentType?: string;
}

interface AddDropContextValue {
  open: () => void;
  openWithKind?: (kind: DropKindOption) => void;
  openWithShare?: (payload: SharePayload) => void;
}

export const AddDropContext = createContext<AddDropContextValue>({
  open: () => {},
});

export function useAddDrop() {
  return useContext(AddDropContext);
}
