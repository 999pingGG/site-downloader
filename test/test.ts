var assert = require("assert");
import * as Util from "../util";

describe("util", function () {
  describe("getPaths() should", () => {
    it("process all URLs correctly.", () => {
      let paths: Util.ProcessedPaths = Util.getPaths("https://www.example.com/resources/index.html", "text/html");
      assert.equal(paths.directory, "www.example.com/resources");
      assert.equal(paths.filename, "index.html");

      paths = Util.getPaths("http://google.com/pages/1/", "text/html");
      assert.equal(paths.directory, "google.com/pages/1");
      assert.equal(paths.filename, "index.html");

      paths = Util.getPaths("https://subdomain.domain.xyz/a-somewhat-long-name", "text/html");
      assert.equal(paths.directory, "subdomain.domain.xyz");
      assert.equal(paths.filename, "a-somewhat-long-name.html");

      paths = Util.getPaths("https://a.n.example.com/assets/images/example.png", "image/png");
      assert.equal(paths.directory, "a.n.example.com/assets/images");
      assert.equal(paths.filename, "example.png");

      paths = Util.getPaths("https://free-images-repo.site/cat", "image/png");
      assert.equal(paths.directory, "free-images-repo.site");
      assert.equal(paths.filename, "cat.png");

      paths = Util.getPaths("ftp://free-images-repo.site", "image/jpeg");
      assert.equal(paths.directory, "free-images-repo.site");
      assert.equal(paths.filename, "index.jpeg");
    });

    it("process weird URLs reasonably well.", () => {
      let paths: Util.ProcessedPaths = Util.getPaths("ultimate-epic-games.net", "blaaarg");
      assert.equal(paths.directory, "ultimate-epic-games.net");
      assert.equal(paths.filename, "index");

      paths = Util.getPaths("pastebin.com/archive/pastes/2016/doc.txt", "invalid-mime-type");
      assert.equal(paths.directory, "pastebin.com/archive/pastes/2016");
      assert.equal(paths.filename, "doc.txt");

      paths = Util.getPaths("pastebin.com", "");
      assert.equal(paths.directory, "pastebin.com");
      assert.equal(paths.filename, "index");

      paths = Util.getPaths("", "video/x-matroska");
      assert.equal(paths.directory, ".");
      assert.equal(paths.filename, "index.mkv");

      paths = Util.getPaths("", "");
      assert.equal(paths.directory, ".");
      assert.equal(paths.filename, "index");

      paths = Util.getPaths("a.org/wrong-extension.png", "video/x-flv");
      assert.equal(paths.directory, "a.org");
      assert.equal(paths.filename, "wrong-extension.png.flv");

      paths = Util.getPaths("E/index.html", "video/x-flv");
      assert.equal(paths.directory, "E");
      assert.equal(paths.filename, "index.html.flv");

      paths = Util.getPaths("ssh://site.site/extension-without-dot-flv", "video/x-flv");
      assert.equal(paths.directory, "site.site");
      assert.equal(paths.filename, "extension-without-dot-flv.flv");
    });

    it("return an empty filename if passed content-type is empty and URL ends with a slash.", () => {
      const paths = Util.getPaths("http://example.com/a/b/c/", "");
      assert.equal(paths.directory, "example.com/a/b/c");
      assert.equal(paths.filename, "");
    });
  });

  describe("collapseSlashGroupsInUrl() should", () => {
    it("collapse unneeded groups.", () => {
      assert.equal(
        Util.collapseSlashGroupsInUrl("https://example.com/this/is//a///weird////url/////lmao"),
        "https://example.com/this/is/a/weird/url/lmao"
      );
    });

    it("not collapse needed groups.", () => {
      assert.equal(
        Util.collapseSlashGroupsInUrl("a////////b//c#d//////e"),
        "a/b/c#d//////e"
      );

      assert.equal(
        Util.collapseSlashGroupsInUrl("a////////b//c?d//////e"),
        "a/b/c?d//////e"
      );
    });
  });

  describe("domainListContains() should", () => {
    it("allow subdomains (lower level domains) of any domain in the list, but not a higher level domain than any domain in the list.", () => {
      const domains = ["google.com", "example.com", "domain", "tests.abc.com"];

      assert.ok(Util.domainListContains("google.com", domains));
      assert.ok(!Util.domainListContains("abc.com", domains));
      assert.ok(Util.domainListContains("sub.domain", domains));
      assert.ok(!Util.domainListContains("google.com.mx", domains));
      assert.ok(Util.domainListContains("images.google.com", domains));
    });
  });

  describe("getLocalRelativeHyperlink() should", () => {
    it("return \".\" if link refers to itself.", () => {
      assert.equal(Util.getLocalRelativeHyperlink("http://example.com/pages/", "https://example.com/pages/"), ".");
      assert.equal(Util.getLocalRelativeHyperlink("https://example.com/", "http://example.com/"), ".");
      assert.equal(Util.getLocalRelativeHyperlink("http://example.com/assets/images/i.jpg", "https://example.com/assets/images/i.jpg"), ".");
    });

    it("return only the filename if the file is in the same directory.", () => {
      assert.equal(Util.getLocalRelativeHyperlink("http://example.com/pages/", "https://example.com/pages/image.png"), "image.png");
      assert.equal(Util.getLocalRelativeHyperlink("https://example.com/", "http://example.com/resource.xml"), "resource.xml");
    });

    it("return a relative path to a file in a subdirectory of the current one.", () => {
      assert.equal(Util.getLocalRelativeHyperlink("http://example.com/pages/", "https://example.com/pages/resources/image.webp"), "resources/image.webp");
      assert.equal(Util.getLocalRelativeHyperlink("https://www.e.net/", "http://www.e.net/sub/folder/data.xml"), "sub/folder/data.xml");
    });

    it("return a relative path to a file in an upper directory.", () => {
      assert.equal(Util.getLocalRelativeHyperlink("http://example.com/pages/index.html", "https://example.com/resources/image.webp"), "../resources/image.webp");
      assert.equal(Util.getLocalRelativeHyperlink("https://www.e.net/a/b/c/d/e/f/g", "https://www.e.net/a/b/c/sub/folder/re/sources/video.mp4"), "../../../sub/folder/re/sources/video.mp4");
    });

    it("return a relative path to a file in another domain.", () => {
      assert.equal(Util.getLocalRelativeHyperlink("http://example.com/pages/index.html", "https://google.com/resources/image.bmp"), "../../google.com/resources/image.bmp");
      assert.equal(Util.getLocalRelativeHyperlink("https://blogs.net/blog/2022/story.html", "https://www.cool-image-repo.site/users/user3000/images/0xff.webp"), "../../../www.cool-image-repo.site/users/user3000/images/0xff.webp");
    });
  });
});