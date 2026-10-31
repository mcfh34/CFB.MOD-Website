import { SEASON_SAVE_VERSION, type SeasonAccomplishments, type SeasonSave } from "./types";

const DATABASE_NAME = "harper-cfb-season-mode";
const DATABASE_VERSION = 1;
const STORE_NAME = "seasons";

export function upgradeSeasonSave(input: SeasonSave | Record<string, unknown>) {
  const save=input as SeasonSave & {dynastyStartSeason?:number;seasonHistory?:SeasonSave["seasonHistory"]};
  const accomplishments=Object.assign({
    conferenceChampion:false,
    bowlGame:null,
    bowlChampion:false,
    playoffQualifier:false,
    playoffSeed:null,
    playoffRoundReached:null,
    nationalChampion:false,
  } satisfies SeasonAccomplishments,save.accomplishments??{});
  return {
    ...save,
    schemaVersion:SEASON_SAVE_VERSION,
    dynastyStartSeason:Number(save.dynastyStartSeason??save.season),
    seasonHistory:Array.isArray(save.seasonHistory)?save.seasonHistory:[],
    difficulty:save.difficulty==="hard"||save.difficulty==="impossible"?save.difficulty:"easy",
    quarterLengthMinutes:Number(save.quarterLengthMinutes)===0?0:Math.max(1,Math.min(15,Math.round(Number(save.quarterLengthMinutes)||15))),
    accomplishments,
  } satisfies SeasonSave;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Season storage could not be opened."));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Season storage failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Season storage failed."));
  });
}

export async function saveSeason(save: SeasonSave) {
  const next = { ...upgradeSeasonSave(save), updatedAt: new Date().toISOString() };
  await transact("readwrite", (store) => store.put(next));
  return next;
}

export async function loadSeason(id: string) {
  const save=await transact<SeasonSave | undefined>("readonly", (store) => store.get(id));
  return save?upgradeSeasonSave(save):undefined;
}

export async function listSeasons() {
  const rows = await transact<SeasonSave[]>("readonly", (store) => store.getAll());
  return rows.map(upgradeSeasonSave).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteSeason(id: string) {
  await transact("readwrite", (store) => store.delete(id));
}
