import mime from "mime-types";

export const windowsOs = process.platform == "win32";

export const sanitizeWindowsFilename = (filename: string): string => filename.replace(/[/\\?%*:|"<>]/g, '_');

export interface ProcessedPaths {
  directory: string;
  filename: string;
}

export const getPaths = (absoluteUrl: string, mimeTypeHeader: string): ProcessedPaths => {
  let result: ProcessedPaths = {
    directory: "",
    filename: ""
  };

  // Take out protocol part.
  let url: string = absoluteUrl.substring(absoluteUrl.indexOf("://") + 3);

  let extensionsByMimeType: string[] = [];
  mimeTypeHeader.split(";").some(part => extensionsByMimeType = mime.extensions[part.trim()]);

  const endsWithSlash: boolean = url.endsWith("/");
  const isHtml: boolean =
    (extensionsByMimeType.findIndex(extension => extension.includes("htm")) > -1) ||
    absoluteUrl.endsWith(".html") ||
    absoluteUrl.endsWith(".htm") ||
    absoluteUrl.endsWith(".xhtml");

  const paramsStartIndex: number = Math.min(url.indexOf("?"), url.indexOf("#"));
  let params: string = "";
  if (paramsStartIndex > -1) {
    params = url.substring(paramsStartIndex + 1);
    url = url.substring(0, paramsStartIndex);
  }

  if (endsWithSlash && isHtml) {
    result.directory = url.slice(0, -1);
    result.filename = "index.html";
  } else {
    const lastSlashIndex = url.lastIndexOf("/");

    if (lastSlashIndex > -1) {
      result.directory = url.substring(0, lastSlashIndex);
      result.filename = url.substring(lastSlashIndex + 1);

      if (result.filename.length == 0)
        result.filename = "index";

      // If the URL ends with an extension, and it is included in the possible extensions by mime type, then we don't need to add one.
      const extensionIndex = extensionsByMimeType.findIndex(extension => result.filename.endsWith(extension));
      const needToAppendExtension: boolean = extensionsByMimeType.length > 0 && extensionIndex < 0;
      if (needToAppendExtension)
        result.filename += "." + extensionsByMimeType[0];
    } else {
      // URL doesn't contain slash.
      result.directory = url;
      if (extensionsByMimeType.length > 0)
        result.filename = "index." + extensionsByMimeType[0];
      else
        result.filename = "index";
    }
  }

  result.filename += params;

  if (windowsOs) {
    result.directory = result.directory.split("/").map(section => sanitizeWindowsFilename(section)).join("/");
    result.filename = sanitizeWindowsFilename(result.filename);
  }

  return result;
};

export const collapseSlashGroupsInUrl = (url: string): string => {
  let asArray = Array.from(url);
  const paramsStartIndex: number = Math.max(asArray.findIndex(char => char == "?"), asArray.findIndex(char => char == "#"));

  for (let i = (paramsStartIndex > -1 ? paramsStartIndex - 1 : asArray.length - 1); i > url.indexOf("://") + 5; i--)
    if (asArray[i] == "/" && asArray[i - 1] == "/")
      asArray.splice(i, 1);

  return asArray.join("");
};