# Security

This alpha is a local tool. Do not expose its Express/Vite port to the Internet or use it as a multi-tenant rendering service. Browser local storage is not encrypted; keep sensitive projects out of a shared browser profile. Claude receives project JSON and your prompt when you request a proposal.

Project JSON is data: bounded parsing rejects unsupported versions, duplicate IDs, unexpected operations, unsafe property keys and invalid graph references. AI operations cannot unlock or delete protected nodes. The renderer limits media to local files for export and blocks third-party browser requests. Uploads accept a bounded media allowlist and use generated filenames; SVG/HTML executable document uploads are not accepted.

Custom React components are trusted code, not a sandbox. Read any component before adding it. FFmpeg/Chromium parse complex media; keep them updated. Node dependency audit is one check, not a complete security assessment.

Please report a suspected vulnerability through the repository's private security advisory workflow if available; otherwise contact Webizmo through https://webizmo.tr without posting exploit material or sensitive files in a public issue. The alpha has no security-response SLA.
