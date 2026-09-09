import { atom } from "recoil";

export const productAtom = atom({
  key: "productAtom",
  default: [],
});

export const formdisplay = atom({
  key: "formdisplay",
  default: false,
});

export const idsend = atom({
  key: "idsend",
  default: [],
});

export const filterdatatom = atom({
  key: "filterdatatom",
  default: [],
});

export const editclicked = atom({
  key: "editclicked",
  default: false,
});

export const printclientdata = atom({
  key: "printclientdata",
  default: [],
});
