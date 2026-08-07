import { createContext, useContext } from "react";

interface AddDropContextValue {
  open: () => void;
  openWithKind?: (kind: "screenshot" | "image" | "link" | "note" | "document") => void;
}

export const AddDropContext = createContext<AddDropContextValue>({
  open: () => {},
});

export function useAddDrop() {
  return useContext(AddDropContext);
}
