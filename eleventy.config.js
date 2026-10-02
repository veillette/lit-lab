module.exports = function (eleventyConfig) {
  // Copy static assets to the root of _site/ (public/css → _site/css)
  eleventyConfig.addPassthroughCopy({ public: "." });

  // Add a filter to format chapter numbers
  eleventyConfig.addFilter("padStart", (val, len, fill) =>
    String(val).padStart(len, fill)
  );

  // Sort collection by fileSlug (e.g. 01-intro < 02-concepts)
  eleventyConfig.addCollection("chapters", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/chapters/*.md")
      .sort((a, b) => a.fileSlug.localeCompare(b.fileSlug))
  );

  return {
    // The server mounts _site at /book; the `url` filter adds this prefix
    pathPrefix: "/book/",
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
