import axios, { AxiosRequestConfig } from "axios";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as URLToolkit from "url-toolkit";
import { URLParts } from "url-toolkit";
const HTMLParser = require("node-html-parser");
const yargs = require("yargs/yargs");

import { domainListContains, getPaths, getAbsoluteUrl, getLocalRelativeHyperlink } from "./util";

const URI_ATTRIBUTES = ["action", "background", "cite", "classid", "codebase", "data", "formaction", "href", "icon", "longdesc", "manifest", "poster", "profile", "src", "usemap"];

const argv = yargs(process.argv.slice(2)).options({
  site: {
    type: "string",
    describe: "Initial site to download. Do not include protocol (http/https).",
    demandOption: true,
    alias: "s"
  },
  ignoreSslErrors: {
    type: "boolean",
    describe: "Whether to ignore SSL errors, like invalid or expired certificates. Useful if cloning old websites with outdated configuration.",
    default: false,
    alias: "i"
  },
  domains: {
    type: "array",
    describe: "Restrict downloading stuff only from these domains. Not passing this option means no domain restriction.",
    default: [],
    alias: "d"
  },
  outputDirectory: {
    type: "string",
    describe: "Where to write downloaded stuff. Here, a new subdirectory will be created for each domain and subdomain.",
    default: ".",
    alias: "o"
  },
  userAgent: {
    type: "string",
    describe: "\"User-Agent\" header to use while crawling websites. Uses an ancient one by default to possibly maximize simplicity of served pages.",
    default: "Mozilla/5.0 (Windows; U; Windows NT 6.1; chrome://navigator/locale/navigator.properties; rv:1.8.0.1) Gecko/20060126",
    alias: "u"
  },
  basicAuthUsername: {
    type: "string",
    describe: "Username to use for basic authentication, i.e. when the browser prompts for a username and a password when opening the URL.",
    alias: "user"
  },
  basicAuthPassword: {
    type: "string",
    describe: "Password to use for basic authentication, i.e. when the browser prompts for a username and a password when opening the URL.",
    alias: "pass"
  }
}).argv;

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: !argv.ignoreSslErrors
  })
});

let axiosOptions: AxiosRequestConfig = {
  headers: {
    "User-Agent": argv.userAgent
  },
  responseType: "arraybuffer"
};

if (axiosOptions.headers && (argv.basicAuthUsername || argv.basicAuthPassword))
  axiosOptions.headers["Authorization"] = `Basic ${Buffer.from(`${argv.basicAuthUsername}:${argv.basicAuthPassword}`).toString("base64")}`;

const { site, domains, outputDirectory } = argv;

const writeFile = (directory: string, filename: string, data: ArrayBuffer) => {
  try {
    if (!fs.existsSync(directory))
      fs.mkdirSync(directory, { recursive: true });
  } catch (error: any) {
    console.error(`Couldn't make directory ${directory}: ${error.message}\n${error.stack}`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(filename, Buffer.from(data));
  } catch (error: any) {
    console.error(`Couldn't write file ${filename}: ${error.message}\n${error.stack}`);
    process.exit(1);
  }
};

const downloadRecursive = (url: string, onResponseUrlReceived?: (url: string) => void) => {
  axiosInstance.get(url, axiosOptions)
    .then(async (response: any) => {
      const responseUrl: string = response.request.res.responseUrl;

      if (onResponseUrlReceived)
        onResponseUrlReceived(responseUrl);

      // No content and reset content, nothing to download.
      if (response.status == 204 || response.status == 205)
        return;

      let contentType = response.headers["content-type"];
      // TODO: Log this with the future logging system. Something like "missing content-type, assuming binary file."
      if (!contentType)
        contentType = "application/octet-stream";

      console.log(`Downloading ${responseUrl}`);

      let dataToWrite: ArrayBuffer = response.data;

      if (contentType.includes("html"))
        dataToWrite = await new Promise((resolve, reject) => {
          const parsed = HTMLParser.parse(response.data, { comment: true });
          let baseHref: string;
          {
            const baseElement = parsed.getElementsByTagName("base")[0];
            if (baseElement && baseElement.href)
              baseHref = baseElement.href;
            else
              baseHref = responseUrl;
          }

          // *** Process HTML document links. ***

          const elements = parsed.getElementsByTagName("*");

          // Can I have a number variable and pass it by reference?
          let elementsAndAttributesLeft = { value: elements.length * URI_ATTRIBUTES.length };

          const attributesProcessed = (n: number = 1) => {
            elementsAndAttributesLeft.value -= n;

            if (elementsAndAttributesLeft.value == 0)
              resolve(parsed.toString());
            else if (elementsAndAttributesLeft.value < 0)
              console.error(`elementsLeftToProcess.value < 0 (${elementsAndAttributesLeft.value}), this is a bug, please report it.`);
          };

          elements.forEach((element: any) => {
            // Ignore the <base> element.
            if (element.rawTagName == "base") {
              attributesProcessed(URI_ATTRIBUTES.length);

              // Download redirection target by <meta http-equiv="refresh" content="...">
            } else if (element.rawTagName == "meta" && element.getAttribute("http-equiv") === "refresh") {
              let content = element.getAttribute("content");
              if (content) {
                content = content.split(";");
                if (content.length >= 2) {
                  content[1] = getAbsoluteUrl(content[1], baseHref);

                  downloadRecursive(content[1], (receivedUrl: string) => {
                    content[1] = getLocalRelativeHyperlink(responseUrl, receivedUrl);
                    content = content.join(";");

                    element.setAttribute("content", content);
                    attributesProcessed(URI_ATTRIBUTES.length);
                  });
                } else
                  attributesProcessed(URI_ATTRIBUTES.length);
              } else
                attributesProcessed(URI_ATTRIBUTES.length);

              // Handle all other elements and attributes.
            } else {
              URI_ATTRIBUTES.forEach(attribute => {
                const urlAttribute = element.getAttribute(attribute);
                if (urlAttribute) {
                  const absoluteUrl: string = getAbsoluteUrl(urlAttribute, baseHref);

                  // Link to self, nothing to do.
                  // TODO: In the future, it is better to check if the file has already been downloaded or is being downloaded, and skip it if it does.
                  if (absoluteUrl == responseUrl) {
                    attributesProcessed();
                  } else {
                    let domain: URLParts | string | null = URLToolkit.parseURL(absoluteUrl);
                    if (domain) {
                      // Take out the "//" at the start.
                      domain = domain.netLoc.substring(2);

                      if (domains.length == 0 || domainListContains(domain, domains))
                        downloadRecursive(absoluteUrl, (receivedUrl: string) => {
                          element.setAttribute(attribute, getLocalRelativeHyperlink(responseUrl, receivedUrl));
                          attributesProcessed();
                        });
                      else
                        attributesProcessed();
                    } else {
                      console.error(`Couldn't parse "${absoluteUrl}". This is a bug, please report it.`);
                      attributesProcessed();
                    }
                  }
                } else
                  attributesProcessed();
              });
            }
          });
        });

      // Actually write downloaded data to file.
      const paths = getPaths(responseUrl, response.headers["content-type"]);

      const outputDirectoryReal = outputDirectory + path.sep + paths.directory;
      const outputFilenameReal = outputDirectoryReal + path.sep + paths.filename;

      writeFile(outputDirectoryReal, outputFilenameReal, dataToWrite);

      console.log(`Downloading ${responseUrl} finished.`);
    })
    .catch((error: any) => {
      if (error.response && error.response.config)
        console.error(`An error has occurred while trying to download ${error.response.config.url}: ${error.message}\n${error.stack}`);
      else
        console.error(`An error has occurred while trying to download ${url}: ${error.message}\n${error.stack}`);

      if (onResponseUrlReceived)
        onResponseUrlReceived(url);
    });
};

downloadRecursive(`http://${site}/`);