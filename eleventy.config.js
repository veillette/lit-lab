module.exports = function (eleventyConfig) {
  // Copy static assets to the root of _site/ (public/css → _site/css)
  eleventyConfig.addPassthroughCopy({ public: "." });

  // Sort collection by fileSlug (e.g. 01-intro < 02-concepts)
  eleventyConfig.addCollection("chapters", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/chapters/*.md")
      .sort((a, b) => a.fileSlug.localeCompare(b.fileSlug))
  );

  return {
    // The book lives under /book; the `url` filter adds this prefix
    pathPrefix: "/book/",
    dir: {
      input: "src",
      output: "_site/book",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
