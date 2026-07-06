import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

const externalArtifactPath = process.env.PI_WEB_UI_E2E_EXTERNAL_ARTIFACT || "/tmp/pi-web-ui-external-artifact.md";

export default [
  fauxAssistantMessage(
    [
      fauxToolCall("write", {
        path: externalArtifactPath,
        content: [
          "# External Skill",
          "",
          "This Markdown artifact lives outside the git workspace.",
          "",
          "The right panel reads it because the Pi session wrote it successfully.",
        ].join("\n"),
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("Updated the external skill docs."),
];
