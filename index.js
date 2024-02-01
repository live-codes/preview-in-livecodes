const fs = require("fs");
const core = require("@actions/core");
const { getPlaygroundUrl } = require("livecodes");
const { encode } = require("js-base64");
const mime = require("mime");

const sha = process.env.SHA || "";
const ref = process.env.REF || "";
const repo = process.env.REPO || "";
const baseUrl = (process.env.BASE_URL || "")
  .replace(/{{\s*LC::SHA\s*}}/g, sha)
  .replace(/{{\s*LC::REF\s*}}/g, ref)
  .replace(/{{\s*LC::REPO\s*}}/g, repo);

const projectsRoot = ".livecodes";

const replaceValues = (str) => {
  const getPattern = (type = "TO_DATA_URL") =>
    `{{\\s*LC::${type}\\(['"]?(?:\\.[\\/\\\\])?([^\\)'"]+)['"]?\\)\\s*}}`;

  return str
    .replace(/{{\s*LC::SHA\s*}}/g, sha)
    .replace(/{{\s*LC::REF\s*}}/g, ref)
    .replace(/{{\s*LC::REPO\s*}}/g, repo)
    .replace(new RegExp(getPattern("TO_DATA_URL"), "g"), (_match, file) => {
      try {
        const type = mime.getType(file) || "text/javascript";
        const content = fs.readFileSync(file, "utf8");
        return content ? toDataUrl(content, type) : file;
      } catch {
        return file;
      }
    })
    .replace(new RegExp(getPattern("TO_URL"), "g"), (_match, file) => {
      if (!baseUrl) return file;
      try {
        return new URL(file, baseUrl).href;
      } catch {
        return file;
      }
    });
};

const getProjects = () => {
  const files = fs.readdirSync(projectsRoot);
  return files
    .map((file) => {
      try {
        const path = `${projectsRoot}/${file}`;
        const content = fs.readFileSync(path, "utf8");
        const contentWithUrls = replaceValues(content);
        const options = JSON.parse(contentWithUrls);
        const isConfig = !Object.keys(options).find((key) =>
          [
            "appUrl",
            "config",
            "params",
            "import",
            "template",
            "view",
            "lite",
            "loading",
          ].includes(key)
        );
        return isConfig ? { config: options } : options;
      } catch (error) {
        console.error(error);
        return;
      }
    })
    .reduce(
      (acc, cur, idx) =>
        !cur
          ? acc
          : {
              ...acc,
              [`${
                cur.config?.title ||
                getStarterTitle(cur.template) ||
                removeExtension(files[idx])
              }`]: cur,
            },
      {}
    );
};

const toDataUrl = (content, type) =>
  `data:${type};charset=UTF-8;base64,` + encode(content, true);

const removeExtension = (path) => path.split(".").slice(0, -1).join(".");

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

const getStarterTitle = (name) =>
  !name ? "" : name.split("-").map(capitalize).join(" ") + " Template";

const trimLongUrl = (url, max) => {
  if (url.length > max) {
    return url.slice(0, max) + "...";
  }
  return url;
};

const generateOutput = (projects) => {
  const projectsMarkDown = projects.map(
    (project) =>
      `| **${project.title}** | [${trimLongUrl(project.url, 50)}](${
        project.url
      }) |`
  );

  return `
## <a href="https://livecodes.io"><img alt="LiveCodes logo" src="https://livecodes.io/livecodes/assets/images/livecodes-logo.svg" width="32"></a> Preview in <a href="https://livecodes.io">LiveCodes</a>

**Latest commit:** ${sha}

|  Project | Link |
|:-:|------------------------|
${projectsMarkDown.join("\n")}
---

_See [LiveCodes documentation](https://livecodes.io/docs) for more details._
  `;
};

try {
  if (!fs.existsSync(projectsRoot)) {
    console.error(`Directory ${projectsRoot} does not exist.`);
  }

  const projectOptions = getProjects();
  if (Object.keys(projectOptions).length === 0) {
    console.error(`No configuration files found in ${projectsRoot}.`);
  }

  const projects = Object.keys(projectOptions).map((key) => {
    const options = projectOptions[key];
    const playgroundUrl = getPlaygroundUrl(options);
    return { title: key, url: playgroundUrl };
  });

  const message = generateOutput(projects);
  core.setOutput("message", message);
} catch (error) {
  core.setFailed(error.message);
}
