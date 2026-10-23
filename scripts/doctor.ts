import { rendererStatus, supportedNode } from "../server/runtime";
const renderer = await rendererStatus();
const checks = [
  {
    name: "node",
    available: supportedNode(process.versions.node),
    detail: `Node ${process.versions.node}; requires 22.12+`,
  },
  ...renderer.checks,
];
for (const check of checks)
  console.log(
    `${check.available ? "OK" : "FAIL"} ${check.name}: ${check.detail}`,
  );
process.exitCode = checks.every((check) => check.available) ? 0 : 1;
