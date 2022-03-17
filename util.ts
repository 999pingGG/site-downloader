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
  const url = absoluteUrl.substring(absoluteUrl.indexOf("://") + 3);

  const extension: string = mime.extension(mimeTypeHeader) || "";
  const endsWithSlash = url.endsWith("/");
  const isHtml = extension.includes("htm");

  if (endsWithSlash && isHtml) {
    result.directory = url.slice(0, -1);
    result.filename = "index.html";
  } else {
    const lastSlashIndex = url.lastIndexOf("/");

    if (lastSlashIndex > -1) {
      result.directory = url.substring(0, lastSlashIndex);
      result.filename = url.substring(lastSlashIndex + 1);

      // File needs extension.
      if (!result.filename.includes("."))
        if (isHtml)
          result.filename += ".html";
        else
          // Is any other type of file, append the corresponding extension by mime type.
          result.filename += "." + extension;
    } else {
      // URL doesn't contain slash.
      if (isHtml) {
        result.directory = url;
        result.filename = "index.html";
      } else {
        result.directory = "."; // Current directory.
        result.filename = url;
        if (!result.filename.includes("."))
          result.filename += "." + extension;
      }
    }
  }

  if (windowsOs) {
    result.directory = result.directory.split("/").map(section => sanitizeWindowsFilename(section)).join("/");
    result.filename = sanitizeWindowsFilename(result.filename);
  }

  return result;
};

export const collapseSlashGroupsInUrl = (url: string): string => {
  let asArray = Array.from(url);
  for (let i = asArray.length - 1; i > url.indexOf("://") + 5; i--) {
    if (asArray[i] == "/" && asArray[i - 1] == "/")
      asArray.splice(i, 1);
  }

  return asArray.join("");
};