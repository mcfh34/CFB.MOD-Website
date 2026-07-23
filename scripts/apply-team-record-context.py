from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Could not find {label} marker")
    return text.replace(old, new, 1)


path = Path("app/page.tsx")
page = path.read_text()
page = replace_once(
    page,
    '  const [rows, setRows] = useState<ScheduleRow[]>([]);\n  const [configured, setConfigured] = useState(false);',
    '  const [rows, setRows] = useState<ScheduleRow[]>([]);\n  const [projectionRows, setProjectionRows] = useState<ScheduleRow[]>([]);\n  const [projectionLoadedKey, setProjectionLoadedKey] = useState("");\n  const [configured, setConfigured] = useState(false);',
    "projection state",
)
page = replace_once(
    page,
    '  const requestKey = `${season}:${week}:${teamFilter}`;\n  useEffect(() => {',
    '  const requestKey = `${season}:${week}:${teamFilter}`;\n  const projectionRequestKey = `${season}:${teamFilter}`;\n  useEffect(() => {',
    "projection request key",
)
page = replace_once(
    page,
    '  }, [season, week, teamFilter, requestKey]);\n  const loading = loadedKey !== requestKey;',
    '''  }, [season, week, teamFilter, requestKey]);
  useEffect(() => {
    if (!teamFilter) {
      setProjectionRows([]);
      setProjectionLoadedKey(projectionRequestKey);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ view:"schedule", season:String(season), week:"0", team:teamFilter });
    fetch(`/api/data?${params}`, { signal:controller.signal })
      .then((response) => readJsonBody<{ rows?: ScheduleRow[] }>(response))
      .then((payload) => { setProjectionRows(payload.rows || []); setProjectionLoadedKey(projectionRequestKey); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") { setProjectionRows([]); setProjectionLoadedKey(projectionRequestKey); } });
    return () => controller.abort();
  }, [season, teamFilter, projectionRequestKey]);
  const loading = loadedKey !== requestKey;''',
    "full-season projection request",
)
page = replace_once(
    page,
    '  const total = performance.data?.total;\n  const teamProjection = useMemo(() => buildTeamProjectedSeason(activeRows, teamFilter), [activeRows, teamFilter]);',
    '  const total = performance.data?.total;\n  const projectionLoading = Boolean(teamFilter) && projectionLoadedKey !== projectionRequestKey;\n  const activeProjectionRows = projectionLoading ? [] : projectionRows;\n  const teamProjection = useMemo(() => buildTeamProjectedSeason(activeProjectionRows, teamFilter), [activeProjectionRows, teamFilter]);',
    "full-season projection memo",
)
page = replace_once(
    page,
    '<span>{loading ? "Loading games…" : teamFilter && teamProjection.games.length ?',
    '<span>{loading || projectionLoading ? "Loading games…" : teamFilter && teamProjection.games.length ?',
    "projection loading state",
)
path.write_text(page)
