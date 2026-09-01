import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateDepthChart } from "../lib/depthChartArchive";

type Manifest = { charts?: unknown[] } | unknown[];

function chartsFromManifest(value: Manifest) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value.charts) ? value.charts : [];
}

async function main() {
  const [command = "validate", file] = process.argv.slice(2);
  if (!file || !["validate", "import"].includes(command)) {
    throw new Error("Usage: npm run depth:curate -- validate|import path/to/manifest.json");
  }
  const raw = await readFile(resolve(file), "utf8");
  const charts = chartsFromManifest(JSON.parse(raw) as Manifest);
  if (!charts.length) throw new Error("Manifest does not contain any charts.");
  if (charts.length > 25) throw new Error("Split the manifest into batches of at most 25 charts.");
  const validations = charts.map((chart) => validateDepthChart(chart, true));
  const rejected = validations.flatMap((validation, index) =>
    validation.valid ? [] : [{ chart: index + 1, errors: validation.errors }],
  );
  if (rejected.length) {
    process.stdout.write(`${JSON.stringify({ valid: false, rejected }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const warnings = validations.flatMap((validation, index) =>
    validation.warnings.length ? [{ chart: index + 1, warnings: validation.warnings }] : [],
  );
  if (command === "validate") {
    process.stdout.write(`${JSON.stringify({ valid: true, chartCount: charts.length, warnings }, null, 2)}\n`);
    return;
  }
  const token = process.env.DEPTH_CHART_SYNC_TOKEN;
  if (!token) throw new Error("DEPTH_CHART_SYNC_TOKEN is required for import.");
  const endpoint = process.env.DEPTH_CHART_API_URL || "https://harpercfbmodel.com/api/depth-charts";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ charts }),
  });
  const text = await response.text();
  process.stdout.write(`${text}\n`);
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
