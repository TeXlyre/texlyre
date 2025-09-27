// src/hooks/useTypst.ts
import { useContext } from "react";
import { TypstContext, type TypstContextType } from "../contexts/TypstContext";

export const useTypst = (): TypstContextType => {
    const context = useContext(TypstContext);
    if (!context) {
        throw new Error("useTypst must be used within a TypstProvider");
    }
    return context;
};