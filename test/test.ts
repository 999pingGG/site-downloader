var assert = require("assert");
import * as Util from "../util";

describe("util", function () {
  describe("#getPaths", () => {
    it("Should process all URLs correctly.", () => {
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

    it("Should process weird URLs reasonably well.", () => {
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
  });

  describe("#collapseSlashGroupsInUrl", () => {
    it("Should not collapse groups that should be there.", function () {
      let collapsedUrl: string = Util.collapseSlashGroupsInUrl("https://example.com/this/is//a///weird////url/////lmao?param=a///b");
      assert.equal(collapsedUrl, "https://example.com/this/is/a/weird/url/lmao?param=a///b");

      collapsedUrl = Util.collapseSlashGroupsInUrl("a////////b//c#d//////e");
      assert.equal(collapsedUrl, "a/b/c#d//////e");
    });
  });

  describe("#domainListContains", () => {
    it("Should allow subdomains (lower level domains) of any domain in the list, but not a higher level domain than any domain in the list.", () => {
      const domains = ["google.com", "example.com", "domain", "tests.abc.com"];

      let result: boolean = Util.domainListContains("google.com", domains);
      assert.ok(result);

      result = Util.domainListContains("abc.com", domains);
      assert.ok(!result);

      result = Util.domainListContains("sub.domain", domains);
      assert.ok(result);

      result = Util.domainListContains("google.com.mx", domains);
      assert.ok(!result);

      result = Util.domainListContains("images.google.com", domains);
      assert.ok(result);
    });
  });
});