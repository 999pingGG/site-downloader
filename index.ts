import axios, { AxiosRequestConfig } from "axios";
import https from "https";
import fs from "fs";
import path from "path";
import URLToolkit, { URLParts } from "url-toolkit";
const HTMLParser = require("node-html-parser");
const yargs = require("yargs/yargs");

import { getPaths, collapseSlashGroupsInUrl } from "./util";

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
    describe: "Restrict downloading stuff only from these domains. Defaults to <site>.",
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
  }
}).argv;

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: !argv.ignoreSslErrors
  })
});

const axiosOptions: AxiosRequestConfig = {
  headers: {
    "User-Agent": argv.userAgent
  }
};

const { site, outputDirectory } = argv;
let { domains } = argv;
if (!domains)
  domains = [site];

const writeFile = (directory: string, filename: string, data: string) => {
  try {
    if (!fs.existsSync(directory))
      fs.mkdirSync(directory, { recursive: true });
  } catch (error: any) {
    console.error(`Couldn't make directory ${directory}: ${error.message}`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(filename, data);
  } catch (error: any) {
    console.error(`Couldn't write file ${filename}: ${error.message}`);
    process.exit(1);
  }
};

const download = (url: string) => {
  axiosInstance.get(url, axiosOptions)
    .then((response: any) => {
      // No content and reset content, nothing to download.
      if (response.status == 204 || response.status == 205)
        return;

      let contentType = response.headers["content-type"];
      // TODO: Log this with the future logging system. Something like "missing content-type, assuming binary file."
      if (!contentType)
        contentType = "application/octet-stream";
      const responseUrl: string = response.request.res.responseUrl;

      console.log(`Downloading ${responseUrl}`);

      let htmlToWrite: string | false = false;
      if (contentType.includes("html")) {
        const parsed = HTMLParser.parse(response.data);
        let baseHref: string;
        {
          const baseElement = parsed.getElementsByTagName("base")[0];
          if (baseElement && baseElement.href)
            baseHref = baseElement.href;
        }

        // Process HTML document links.
        parsed.getElementsByTagName("*").forEach((element: any) => {
          let href = element.getAttribute("href");
          if (href) {
            // Make sure a starting slash is always taken as a relative URL.
            if (href[0] == "/")
              href = "." + href;

            //                                                                                                                   Extract protocol part.
            const isRelativeUrl: boolean = href.startsWith("./") || href.startsWith("../") || !SUPPORTED_PROTOCOLS.includes(href.substring(0, href.indexOf("://")));

            const finalUrl: string = collapseSlashGroupsInUrl(isRelativeUrl ? URLToolkit.buildAbsoluteURL(baseHref ? baseHref : responseUrl, href, { alwaysNormalize: true }) : href);

            let domain: URLParts | string | null = URLToolkit.parseURL(finalUrl);
            if (domain) {
              // Take out the "//" at the start.
              domain = domain.netLoc.substring(2);

              if (domains.includes(domain))
                download(finalUrl);
            } else
              throw new Error(`Couldn't parse "${finalUrl}". This is a bug, please report it.`);
          }
        });

        htmlToWrite = parsed.toString();
      }

      // Actually download file.
      const paths = getPaths(responseUrl, response.headers["content-type"]);

      const outputDirectoryReal = outputDirectory + path.sep + paths.directory;
      const outputFilenameReal = outputDirectoryReal + path.sep + paths.filename;

      writeFile(outputDirectoryReal, outputFilenameReal, htmlToWrite || response.data);
    })
    .catch((error: any) => {
      if (error.response && error.response.config)
        console.error(`An error has occurred while trying to download ${error.response.config.url}: ${error.message}`);
      else
        console.error(`An error has occurred while trying to download ${url}: ${error.message}`);
    });
};

download(`http://${site}/`);