import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyTransaction,
  parseProject,
  type Project,
  type Operation,
} from "../core";
import { demoProject } from "../../examples/demo.ts";

const STORAGE_KEY = "cadencegraph.project.v1";
const MAX_HISTORY = 60;

function initialProject(): Project {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseProject(JSON.parse(saved));
  } catch {
    /* Recover from incompatible or corrupt local storage. */
  }
  return structuredClone(demoProject);
}

export function useProject() {
  const [project, setProject] = useState<Project>(initialProject);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      setStorageError("");
    } catch {
      setStorageError(
        "Browser storage is unavailable. Export your project to keep these changes.",
      );
    }
  }, [project]);
  const replace = useCallback((next: Project) => {
    const current = projectRef.current;
    const revised = {
      ...next,
      revision: Math.max(current.revision + 1, next.revision),
    };
    setPast((values) => [...values.slice(-MAX_HISTORY + 1), current]);
    setFuture([]);
    projectRef.current = revised;
    setProject(revised);
  }, []);
  const transact = useCallback(
    (
      operations: Operation[],
      actor: "human" | "ai" = "human",
      baseRevision?: number,
    ) => {
      const current = projectRef.current;
      const result = applyTransaction(current, {
        id: crypto.randomUUID(),
        actor,
        baseRevision: baseRevision ?? current.revision,
        operations,
      });
      if (result.applied) replace(result.project);
      return result;
    },
    [replace],
  );
  const undo = useCallback(() => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([project, ...future]);
    setProject({ ...previous, revision: project.revision + 1 });
    setNotice("Undid the last change.");
  }, [past, future, project]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast([...past, project]);
    setFuture(future.slice(1));
    setProject({ ...future[0], revision: project.revision + 1 });
    setNotice("Restored the change.");
  }, [past, future, project]);
  return {
    project,
    replace,
    transact,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    storageError,
    notice,
    setNotice,
  };
}
