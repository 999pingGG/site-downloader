import axios, { AxiosRequestConfig } from "axios";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as URLToolkit from "url-toolkit";
import { URLParts } from "url-toolkit";
const HTMLParser = require("node-html-parser");
const yargs = require("yargs/yargs");

import { getPaths, collapseSlashGroupsInUrl, domainListContains } from "./util";

// Does Axios even support ftp?
const SUPPORTED_PROTOCOLS = ["http", "https", "ftp"];

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
  }
};

if (axiosOptions.headers && (argv.basicAuthUsername || argv.basicAuthPassword))
  axiosOptions.headers["Authorization"] = `Basic ${Buffer.from(`${argv.basicAuthUsername}:${argv.basicAuthPassword}`).toString("base64")}`;

const { site, domains, outputDirectory } = argv;

const writeFile = (directory: string, filename: string, data: string) => {
  try {
    if (!fs.existsSync(directory))
      fs.mkdirSync(directory, { recursive: true });
  } catch (error: any) {
    console.error(`Couldn't make directory ${directory}: ${error.message}\n${error.stack}`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(filename, data);
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

      let dataToWrite: string = response.data;
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
          let elementsLeftToProcess = { value: elements.length };

          const elementProcessed = () => {
            elementsLeftToProcess.value--;

            if (elementsLeftToProcess.value == 0)
              resolve(parsed.toString());
            else if (elementsLeftToProcess.value < 0)
              console.error(`elementsLeftToProcess.value < 0 (${elementsLeftToProcess.value}), this is a bug, please report it.`);
          };

          elements.forEach((element: any) => {
            // Ignore the <base> element.
            if (element.rawTagName == "base") {
              elementProcessed();
              return;
            }

            let href = element.getAttribute("href");
            if (href) {
              //                                                                                                                   Extract protocol part.
              const isRelativeUrl: boolean = href.startsWith("./") || href.startsWith("../") || !SUPPORTED_PROTOCOLS.includes(href.substring(0, href.indexOf("://")));

              const absoluteUrl: string = collapseSlashGroupsInUrl(isRelativeUrl ? URLToolkit.buildAbsoluteURL(baseHref, href, { alwaysNormalize: true }) : href);

              let domain: URLParts | string | null = URLToolkit.parseURL(absoluteUrl);
              if (domain) {
                // Take out the "//" at the start.
                domain = domain.netLoc.substring(2);

                if (domains.length == 0 || domainListContains(domain, domains))
                  downloadRecursive(absoluteUrl, (receivedUrl: string) => {
                    // TODO: Replace absolute URL here with a local one.
                    element.setAttribute("href", receivedUrl);
                    elementProcessed();
                  });
                else
                  elementProcessed();
              } else {
                console.error(`Couldn't parse "${absoluteUrl}". This is a bug, please report it.`);
                elementProcessed();
              }
            } else
              elementProcessed();
          });
        });

      // Actually write downloaded data to file.
      const paths = getPaths(responseUrl, response.headers["content-type"]);

      const outputDirectoryReal = outputDirectory + path.sep + paths.directory;
      const outputFilenameReal = outputDirectoryReal + path.sep + paths.filename;

      writeFile(outputDirectoryReal, outputFilenameReal, dataToWrite);
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