import * as mime from "mime-types";
import * as URLToolkit from "url-toolkit";

// Does Axios even support ftp?
const SUPPORTED_PROTOCOLS = ["http", "https", "ftp"];

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

  let extensionsByMimeType: string[] = [];
  mimeTypeHeader.split(";").some(part => extensionsByMimeType = mime.extensions[part.trim()]);

  // Empty URL passed.
  if (!absoluteUrl) {
    result.directory = ".";
    result.filename = "index";

    if (extensionsByMimeType && extensionsByMimeType.length > 0)
      result.filename += "." + extensionsByMimeType[0];

    return result;
  }

  // Take out protocol and fragment parts.
  const hashIndex = absoluteUrl.indexOf("#");
  const indexOf = absoluteUrl.indexOf("://");
  let url: string = absoluteUrl.substring(indexOf > -1 ? indexOf + 3 : 0, hashIndex > -1 ? hashIndex : absoluteUrl.length);

  const endsWithSlash: boolean = url.endsWith("/");
  const isHtml: boolean =
    extensionsByMimeType && (
      (extensionsByMimeType.findIndex(extension => extension.includes("htm")) > -1) ||
      absoluteUrl.endsWith(".html") ||
      absoluteUrl.endsWith(".htm") ||
      absoluteUrl.endsWith(".xhtml")
    );

  const paramsStartIndex: number = getParamsStartIndex(url);
  const hasParams: boolean = paramsStartIndex > -1;

  let params: string = "";
  if (hasParams) {
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

      // If the URL ends with an extension, and it is included in the possible extensions by mime type, then we don't need to add one.
      const extensionIndex = extensionsByMimeType ? extensionsByMimeType.findIndex(extension => result.filename.endsWith("." + extension)) : 0;
      const needToAppendExtension: boolean = !!extensionIndex && extensionsByMimeType.length > 0 && extensionIndex < 0;

      if (needToAppendExtension) {
        if (endsWithSlash)
          result.filename = "index";

        result.filename += "." + extensionsByMimeType[0];
      }
    } else {
      // URL doesn't contain slash.
      result.directory = url;
      if (extensionsByMimeType && extensionsByMimeType.length > 0)
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

// This function is useful in the weird case where an URL contains a group of slashes (they all should be treated as one).
export const collapseSlashGroupsInUrl = (url: string): string => {
  let asArray = Array.from(url);

  const paramsStartIndex: number = getParamsStartIndex(url);
  const hasParams: boolean = paramsStartIndex > -1;

  let startingIndex = url.indexOf("://");
  startingIndex = startingIndex < 0 ? 1 : startingIndex + 4;

  for (let i = (hasParams ? paramsStartIndex - 1 : asArray.length - 1); i > startingIndex; i--)
    if (asArray[i] == "/" && asArray[i - 1] == "/")
      asArray.splice(i, 1);

  return asArray.join("");
};

const getParamsStartIndex = (url: string): number => {
  const questionMarkIndex: number = url.indexOf("?");
  const hashIndex: number = url.indexOf("#");

  const hasQuestionMark: boolean = questionMarkIndex > -1;
  const hasHash: boolean = hashIndex > -1;

  if (!hasQuestionMark && !hasHash)
    return -1;
  else if (hasQuestionMark && !hasHash)
    return questionMarkIndex;
  else if (hasHash && !hasQuestionMark)
    return hashIndex;
  else
    return Math.min(questionMarkIndex, hashIndex);
};

export const domainListContains = (domain: string, domainList: string[]): boolean => domainList.some(element => domain.endsWith(element));

export const getLocalRelativeHyperlink = (htmlDocumentUrl: string, link: string): string => {
  const htmlDocumentPaths = getPaths(htmlDocumentUrl, "");
  const linkPaths = getPaths(link, "");

  if (htmlDocumentPaths.directory == linkPaths.directory && htmlDocumentPaths.filename == linkPaths.filename)
    return ".";

  let htmlDocumentUrlParts = htmlDocumentPaths.directory.split("/");

  let linkParts = [
    ...linkPaths.directory.split("/"),
    linkPaths.filename
  ];

  for (let i = 0; htmlDocumentUrlParts.length && linkParts.length && htmlDocumentUrlParts[0] == linkParts[0]; i++) {
    htmlDocumentUrlParts.splice(0, 1);
    linkParts.splice(0, 1);
  }

  return "../".repeat(htmlDocumentUrlParts.length) + linkParts.join("/");
};

export const getAbsoluteUrl = (url: string, baseHref: string): string => {
  //                                                                                                                   Extract protocol part.
  const isRelativeUrl: boolean = url.startsWith("./") || url.startsWith("../") || !SUPPORTED_PROTOCOLS.includes(url.substring(0, url.indexOf("://")));
  return collapseSlashGroupsInUrl(isRelativeUrl ? URLToolkit.buildAbsoluteURL(baseHref, url, { alwaysNormalize: true }) : url);
};