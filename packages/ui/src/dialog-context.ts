import * as React from "react";

export const DialogContext = React.createContext<boolean>(false);
export const useDialogContext = () => React.useContext(DialogContext);
