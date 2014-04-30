var cleanProperty, cleanSelector, cleanedSelectors, compareSpecificity, cssParse, cssSpecificity, cssStringify, fs, jsdom, keepIf, loadHtml, loadHtmls, loadStyles, path, pp, puts, removeGarbageProperties, removeGarbageSelectors, removeGarbageSelectorsFromStyle, updateStyles, usage;

fs = require('fs');

path = require('path');

jsdom = require('jsdom');

cssParse = require('css-parse');

cssStringify = require('css-stringify');

cssSpecificity = require('specificity');

puts = console.log.bind(console);

pp = function(obj) {
  return puts(JSON.stringify(obj, null, '  '));
};

keepIf = function(arr, fn) {
  var i, iz;
  i = -1;
  iz = arr.length;
  while (++i < iz) {
    if (!(fn(arr[i], i, iz, arr) === false)) {
      continue;
    }
    arr.splice(i, 1);
    --i;
    --iz;
  }
};

cleanSelector = function(selector) {
  return selector.replace(/:?:(?:link|visited|active|hover|focus|target|after|before|first-l(?:etter|ine)|selection)/g, '');
};

cleanedSelectors = function(selectors) {
  selectors = selectors.join(',');
  return selectors === cleanSelector(selectors);
};

cleanProperty = function(property) {
  return property.replace(/^-\w+-/, '');
};

compareSpecificity = function(a, b) {
  var aSpec, asi, bSpec, bsi, i, _i, _len;
  aSpec = a.split(',');
  bSpec = b.split(',');
  for (i = _i = 0, _len = aSpec.length; _i < _len; i = ++_i) {
    asi = aSpec[i];
    bsi = bSpec[i];
    if (asi !== bsi) {
      if (asi < bsi) {
        return 1;
      } else {
        return -1;
      }
    }
  }
  return 0;
};

usage = function() {
  puts('usage: css-refector *.html');
  return process.exit();
};

updateStyles = function(useRule, curDecorations, newDecorations, specificity) {
  return newDecorations.forEach(function(newRule) {
    var prop;
    prop = newRule.property;
    if (!prop) {
      return;
    }
    prop = cleanProperty(prop);
    curDecorations[prop] || (curDecorations[prop] = {});
    if (!curDecorations[prop].specificity || compareSpecificity(curDecorations[prop].specificity, specificity) > -1) {
      if (curDecorations[prop].rule) {
        --curDecorations[prop].rule[prop];
      }
      useRule[prop] || (useRule[prop] = 0);
      ++useRule[prop];
      curDecorations[prop].rule = useRule;
      return curDecorations[prop].specificity = specificity;
    }
  });
};

removeGarbageProperties = function(docs, styles) {
  var name, removeGarbagePropertiesFromRule, rules, style, useRules;
  removeGarbagePropertiesFromRule = function(rule, doc, useRule, docStyle) {
    var media;
    switch (rule.type) {
      case 'media':
        media = "@media " + rule.media;
        rule.rules.forEach(function(rule, i) {
          return removeGarbagePropertiesFromRule(rule, doc, function() {
            var _base;
            return (_base = useRule())[i] || (_base[i] = {});
          }, function(num) {
            var _base;
            return (_base = docStyle(num))[media] || (_base[media] = {});
          });
        });
        break;
      case 'rule':
        if (!cleanedSelectors(rule.selectors)) {
          return;
        }
        rule.selectors.forEach(function(selector) {
          var specificity;
          specificity = cssSpecificity.calculate(selector)[0].specificity;
          return doc.$(selector).each(function(i) {
            return updateStyles(useRule(), docStyle(this.uniqueNumber), rule.declarations, specificity);
          });
        });
        break;
      case 'comment':
      case 'charset':
      case 'keyframes':
        break;
      default:
        pp(rule);
        throw new Error("invalid rule type: type = " + rule.type);
    }
  };
  useRules = {};
  docs.forEach(function(doc, i) {
    doc.styles = {};
    doc.$('*').each(function(j) {
      return this.uniqueNumber = j;
    });
    return doc.stylePaths.forEach(function(stylePath) {
      useRules[stylePath] || (useRules[stylePath] = {});
      return styles[stylePath].data.stylesheet.rules.forEach(function(rule, i) {
        return removeGarbagePropertiesFromRule(rule, doc, function() {
          var _base;
          return (_base = useRules[stylePath])[i] || (_base[i] = {});
        }, function(num) {
          var _base;
          return (_base = doc.styles)[num] || (_base[num] = {});
        });
      });
    });
  });
  for (name in styles) {
    style = styles[name];
    rules = style.data.stylesheet.rules.reverse();
    keepIf(rules, function(rule, i, size) {
      var media, removeDecoration, removeGarbageDecorationsByRule, useRule;
      useRule = useRules[name][size - i - 1];
      removeDecoration = function(decoration, targetRule) {
        var prop;
        prop = decoration.property;
        if (!prop) {
          return;
        }
        prop = cleanProperty(prop);
        return !!(targetRule != null ? targetRule[prop] : void 0);
      };
      removeGarbageDecorationsByRule = function(rule, useRule) {
        if (!cleanedSelectors(rule.selectors)) {
          return;
        }
        keepIf(rule.declarations, function(dec) {
          return removeDecoration(dec, useRule);
        });
        if (!(rule.selectors.length && rule.declarations.length)) {
          return false;
        }
      };
      switch (rule.type) {
        case 'media':
          media = "@media " + rule.media;
          keepIf(rule.rules, function(rule) {
            return removeGarbageDecorationsByRule(rule, useRule != null ? useRule[media] : void 0);
          });
          if (!rule.rules.length) {
            return false;
          }
          break;
        case 'rule':
          return removeGarbageDecorationsByRule(rule, useRule);
      }
    });
    style.data.stylesheet.rules = rules.reverse();
  }
};

removeGarbageSelectorsFromStyle = function(docs, style) {
  var removeGarbageSelectorsFromRule;
  removeGarbageSelectorsFromRule = function(rule, i) {
    switch (rule.type) {
      case 'media':
        keepIf(rule.rules, removeGarbageSelectorsFromRule);
        if (!rule.rules.length) {
          return false;
        }
        break;
      case 'rule':
        keepIf(rule.selectors, function(selector) {
          var doc;
          selector = cleanSelector(selector);
          for (doc in style.docs) {
            if (docs[doc].$(selector).length) {
              return;
            }
          }
          return false;
        });
        if (!(rule.selectors.length && rule.declarations.length)) {
          return false;
        }
        break;
      case 'comment':
      case 'charset':
      case 'keyframes':
        break;
      default:
        pp(rule);
        throw new Error("invalid rule type: type = " + rule.type);
    }
  };
  return keepIf(style.data.stylesheet.rules, removeGarbageSelectorsFromRule);
};

removeGarbageSelectors = function(docs, styles) {
  var name, style, _ref, _ref1;
  for (name in styles) {
    style = styles[name];
    if (!(style.data && style.data.type === 'stylesheet')) {
      throw new Error("invalid style type: url = " + name + ", type = " + ((_ref = style.data) != null ? _ref.type : void 0));
    }
    if (((_ref1 = style.data.stylesheet) != null ? _ref1.rules : void 0) == null) {
      throw new Error("invalid style object: url = " + name);
    }
    removeGarbageSelectorsFromStyle(docs, style);
  }
};

loadStyles = function(docs) {
  var styles;
  styles = {};
  docs.forEach(function(doc, i) {
    puts("target html [" + i + "]: " + doc.path);
    return doc.$('link[rel="stylesheet"]').each(function() {
      var stylePath;
      stylePath = path.join(path.dirname(doc.path), doc.$(this).attr('href'));
      if (!styles[stylePath]) {
        styles[stylePath] = {
          docs: [],
          data: cssParse(fs.readFileSync(stylePath, 'UTF-8'))
        };
        puts("loaded css: " + stylePath);
      }
      styles[stylePath].docs.push(i);
      doc.stylePaths.push(stylePath);
    });
  });
  removeGarbageSelectors(docs, styles);
  removeGarbageProperties(docs, styles);
  return styles;
};

loadHtml = function(htmlPath, fn) {
  return jsdom.env(fs.readFileSync(htmlPath, 'UTF-8'), ['http://code.jquery.com/jquery.js'], fn);
};

loadHtmls = function(htmlPaths, fn) {
  var docs, size;
  size = htmlPaths.length;
  docs = new Array(size);
  return htmlPaths.forEach(function(htmlPath, i) {
    puts("load html [" + i + "]: " + htmlPath);
    return loadHtml(htmlPath, function(errors, window) {
      puts("loaded html [" + i + "]: " + htmlPath);
      if (errors) {
        puts(errors.join("\n"));
        process.exit();
      }
      docs[i] = {
        $: window.$,
        path: htmlPath,
        stylePaths: []
      };
      if (!--size) {
        return fn(docs, loadStyles(docs));
      }
    });
  });
};

module.exports.run = function() {
  var htmlPaths;
  htmlPaths = process.argv.slice(2);
  if (!htmlPaths.length) {
    usage();
  }
  return loadHtmls(htmlPaths, function(docs, styles) {
    var name, style;
    for (name in styles) {
      style = styles[name];
      fs.writeFile(name, cssStringify(style.data));
    }
  });
};
