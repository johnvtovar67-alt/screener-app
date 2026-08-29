const fs = require("fs");
const path = require("path");
const vm = require("vm");

// The application intentionally remains a Next.js/CommonJS project. This small
// loader lets offline research commands execute the same ES-module source files
// that production imports, avoiding a second copy of the decision methodology.
function createResearchModuleLoader(root = process.cwd()) {
  const cache = new Map();

  function resolveModule(fromFile, request) {
    if (!request.startsWith("."))
      throw new Error(`Research loader only accepts local imports: ${request}`);
    const candidate = path.resolve(path.dirname(fromFile), request);
    for (const file of [candidate, `${candidate}.js`, path.join(candidate, "index.js")])
      if (fs.existsSync(file)) return file;
    throw new Error(`Cannot resolve ${request} from ${fromFile}`);
  }

  function load(request, fromFile = path.join(root, "__research__.js")) {
    const file = request.startsWith(".")
      ? resolveModule(fromFile, request)
      : path.resolve(root, request);
    if (cache.has(file)) return cache.get(file).exports;
    const record = { exports: {} };
    cache.set(file, record);
    let source = fs.readFileSync(file, "utf8");
    const imported = {};
    source = source.replace(
      /import\s*{([\s\S]*?)}\s*from\s*["']([^"']+)["'];?/g,
      (_, specifiers, dependency) => {
        const values = load(dependency, file);
        for (const raw of specifiers.split(",")) {
          const part = raw.trim();
          if (!part) continue;
          const [remote, local = remote] = part.split(/\s+as\s+/);
          if (!(remote.trim() in values))
            throw new Error(`${remote.trim()} is not exported by ${dependency}`);
          imported[local.trim()] = values[remote.trim()];
        }
        return "";
      },
    );
    if (/^\s*import\s/m.test(source))
      throw new Error(`Unsupported import syntax in ${path.relative(root, file)}`);

    const exportNames = new Set();
    source = source.replace(
      /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
      (match, name) => {
        exportNames.add(name);
        return match.replace("export ", "");
      },
    );
    source = source.replace(
      /export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
      (match, name) => {
        exportNames.add(name);
        return match.replace("export ", "");
      },
    );
    source = source.replace(/export\s*{([\s\S]*?)}\s*;?/g, (_, names) => {
      for (const raw of names.split(",")) {
        const part = raw.trim();
        if (!part) continue;
        const [local, exported = local] = part.split(/\s+as\s+/);
        if (local.trim() !== exported.trim())
          throw new Error("Aliased export blocks are not supported by the research loader");
        exportNames.add(local.trim());
      }
      return "";
    });
    source += `\nmodule.exports = {${[...exportNames].join(",")}};\n`;

    const sandbox = {
      module: record,
      exports: record.exports,
      console,
      process,
      Date,
      Intl,
      Math,
      Number,
      String,
      Object,
      Array,
      Set,
      Map,
      WeakMap,
      Boolean,
      RegExp,
      Error,
      TypeError,
      JSON,
      URL,
      URLSearchParams,
      AbortController,
      AbortSignal,
      Response,
      fetch,
      setTimeout,
      clearTimeout,
      ...imported,
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: file });
    record.exports = sandbox.module.exports;
    return record.exports;
  }

  return { load };
}

module.exports = { createResearchModuleLoader };
