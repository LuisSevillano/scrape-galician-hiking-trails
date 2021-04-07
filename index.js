const pLimit = require("p-limit");

const request = require("request-promise");
const cheerio = require("cheerio");
const fs = require("fs");
const d3Dsv = require("d3-dsv");

// https:stackoverflow.com/questions/40639432/what-is-the-best-way-to-limit-concurrency-when-using-es6s-promise-all
const limit = pLimit(1);

const filePath = "posts_info.tsv";
const stream = fs.createWriteStream(filePath, { flags: "a" });
createFileHeaders();

const startingUrl =
  "https://www.caminandoentresenderos.com/category/espana/galicia/page/";

const pages = {
  from: 1,
  to: 11,
};
const indexes = [];
for (let index = pages.from; index <= pages.to; index++) {
  indexes.push(index);
}
let urls = indexes.map(i => `${startingUrl}${i}/`);

let promises = urls.map(url => {
  return limit(() =>
    request(url).then(function (body) {
      console.log(`Fetching posts data from ${url}`);
      const $ = cheerio.load(body, { ignoreWhitespace: true });
      Array.from($(".site-main .post .entry-title a")).map((el, i) => {
        const postURL = $(el).attr("href");
        return limit(() => request(postURL, getPostInfo));
      });
    })
  );
});

function getSpans($) {
  const firstHRElement = $(".entry-content hr");
  const parent = firstHRElement.parent();

  let firstHRElementIndex = null;
  for (let index = 0; index < parent.children().length; index++) {
    const element = parent.children()[index];
    if (element.name === "hr") {
      firstHRElementIndex = index;
      break;
    }
  }

  const spans = [];
  for (var i = firstHRElementIndex + 1; i < parent.children().length; i++) {
    const el = parent.children()[i];

    if (el.name === "hr") break;
    if (el.name === "p") {
      spans.push($(el).find("span"));
    }
  }
  return spans;
}
async function getPostInfo(error, response, body) {
  if (!error) {
    const $ = cheerio.load(body, { ignoreWhitespace: true });
    const postURL = response.request.href;
    const postData = createRow({});

    postData["ruta_nombre"] = $(".entry-title").text();

    console.log(`Getting data from ${postData["ruta_nombre"]}`);

    const spans = getSpans($);
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i];

      const bolds = $(el)
        .find("strong")
        .each(function (z, el) {
          const content = $(el).text();

          if (content !== "|") {
            let key = cleanValue($(el).text().trim());
            let value;
            const values = getNextSiblings($(el)[0]);

            for (let h = 0; h < values.length; h++) {
              if (value === undefined) {
                if (
                  key === "Más info" &&
                  values[h].type === "tag" &&
                  values[h].name === "a"
                ) {
                  value = $(values[h]).attr("href");
                } else if (values[h].type === "tag" && values[h].name === "a") {
                  value = $(values[h]).text();
                } else if (
                  values[h].type === "text" &&
                  values[h].data !== " "
                ) {
                  value = values[h].data
                    .replace(":", "")
                    .replace("|", "")
                    .trim();
                }
              }
            }

            if (key.includes("distancia")) key = "distancia";

            if (key.toLowerCase().includes("coordenadas")) {
              key = "coordenadas";
            }

            postData[key] = value;
          }
        });
      postData["wikiloc"] = "";

      $(el)
        .find("a")
        .each((k, a) => {
          const href = $(a).attr("href");
          if (href.includes("wikiloc")) postData["wikiloc"] = href;
        });
    }

    // add a new post to the main array
    postData["post_url"] = postURL;
    stream.write(d3Dsv.tsvFormatBody([postData]) + "\n");
  }
}

function createFileHeaders() {
  stream.write(d3Dsv.tsvFormat([createRow({})]) + "\n");
}

function createRow(args) {
  let postData = {
    ruta_nombre: "",
    distancia: "",
    duración: "",
    "estación recomendada": "",
    niños: "",
    señalización: "",
    bici: "",
    asfalto: "",
    "ruta circular": "",
    dificultad: "",
    "más info": "",
    coordenadas: "",
    wikiloc: "No disponible",
    post_url: "",
  };

  Object.keys(postData).forEach(function (key) {
    postData[key] = args[key];
  });

  return postData;
}

function getNextSiblings(el) {
  const siblings = [];
  while ((el = el.nextSibling)) {
    siblings.push(el);
  }
  return siblings;
}

function cleanValue(str) {
  return str
    .toLowerCase()
    .replace("|", "")
    .replace(/\s\s+/g, "_")
    .replace(/\:/gi, "")
    .replace(/\*/gi, "")
    .replace(/-/gi, "");
}
