fs = require 'fs'
path = require 'path'
jsdom = require 'jsdom'
cssParse = require 'css-parse'
cssStringify = require 'css-stringify'
cssSpecificity = require 'specificity'

# util methods
puts = console.log.bind(console)
pp = (obj) -> puts JSON.stringify(obj, null, '  ')

keepIf = (arr, fn) ->
  i = -1
  iz = arr.length
  while ++i < iz when fn(arr[i], i, iz, arr) == false
    arr.splice(i, 1)
    --i
    --iz
  return

cleanSelector = (selector) ->
  selector.replace(/:?:(?:link|visited|active|hover|focus|target|after|before|first-l(?:etter|ine)|selection)/g, '')

cleanedSelectors = (selectors) ->
  selectors = selectors.join(',')
  selectors == cleanSelector(selectors)

cleanProperty = (property) ->
  property.replace(/^-\w+-/, '')

compareSpecificity = (a, b) ->
  aSpec = a.split(',')
  bSpec = b.split(',')
  for asi, i in aSpec
    bsi = bSpec[i]
    unless asi == bsi
      return if asi < bsi then 1 else -1
  0

usage = ->
  puts 'usage: css-refector *.html'
  process.exit()

updateStyles = (useRule, curDecorations, newDecorations, specificity) ->
  newDecorations.forEach (newRule) ->
    prop = newRule.property
    return unless prop
    prop = cleanProperty(prop)
    curDecorations[prop] ||= {}
    if !curDecorations[prop].specificity || compareSpecificity(curDecorations[prop].specificity, specificity) > -1
      --curDecorations[prop].rule[prop] if curDecorations[prop].rule
      useRule[prop] ||= 0
      ++useRule[prop]
      curDecorations[prop].rule = useRule
      curDecorations[prop].specificity = specificity

removeGarbageProperties = (docs, styles) ->
  removeGarbagePropertiesFromRule = (rule, doc, useRule, docStyle) ->
    switch rule.type
      when 'media'
        media = "@media #{rule.media}"
        rule.rules.forEach (rule, i) ->
          removeGarbagePropertiesFromRule(
            rule, doc,
            -> useRule()[i] ||= {}
            (num) -> docStyle(num)[media] ||= {}
          )
      when 'rule'
        return unless cleanedSelectors(rule.selectors)
        rule.selectors.forEach (selector) ->
          specificity = cssSpecificity.calculate(selector)[0].specificity
          doc.$(selector).each (i) ->
            updateStyles(useRule(), docStyle(@uniqueNumber), rule.declarations, specificity)
      when 'comment', 'charset', 'keyframes' then
      else
        pp rule
        throw new Error("invalid rule type: type = #{rule.type}")
    return

  useRules = {} # useRules[stylePath][ruleIndex...][property] = N
  docs.forEach (doc, i) ->
    doc.styles = {} # doc.styles[uniqueNumber...][property] = { rule: useRuleObject, specificity: 0 }
    doc.$('*').each (j) -> @uniqueNumber = j
    doc.stylePaths.forEach (stylePath) ->
      useRules[stylePath] ||= {}
      styles[stylePath].data.stylesheet.rules.forEach (rule, i) ->
        removeGarbagePropertiesFromRule(
          rule, doc,
          -> useRules[stylePath][i] ||= {}
          (num) -> doc.styles[num] ||= {}
        )

  for name, style of styles
    rules = style.data.stylesheet.rules.reverse()
    keepIf rules, (rule, i, size) ->
      useRule = useRules[name][size - i - 1]

      removeDecoration = (decoration, targetRule) ->
        prop = decoration.property
        return unless prop
        prop = cleanProperty(prop)
        !!(targetRule?[prop])

      removeGarbageDecorationsByRule = (rule, useRule) ->
        return unless cleanedSelectors(rule.selectors)
        keepIf rule.declarations, (dec) ->
          removeDecoration(dec, useRule)
        return false unless rule.selectors.length && rule.declarations.length
        return

      switch rule.type
        when 'media'
          media = "@media #{rule.media}"
          keepIf rule.rules, (rule) ->
            removeGarbageDecorationsByRule(rule, useRule?[media])
          return false unless rule.rules.length
        when 'rule'
          return removeGarbageDecorationsByRule(rule, useRule)
      return
    style.data.stylesheet.rules = rules.reverse()
  return

removeGarbageSelectorsFromStyle = (docs, style) ->
  removeGarbageSelectorsFromRule = (rule, i) ->
    switch rule.type
      when 'media'
        keepIf(rule.rules, removeGarbageSelectorsFromRule)
        return false unless rule.rules.length
      when 'rule'
        keepIf rule.selectors, (selector) ->
          selector = cleanSelector(selector)
          return for doc of style.docs when docs[doc].$(selector).length
          false
        return false unless rule.selectors.length && rule.declarations.length
      when 'comment', 'charset', 'keyframes' then
      else
        pp rule
        throw new Error("invalid rule type: type = #{rule.type}")
    return
  keepIf(style.data.stylesheet.rules, removeGarbageSelectorsFromRule)

removeGarbageSelectors = (docs, styles) ->
  for name, style of styles
    unless style.data && style.data.type == 'stylesheet'
      throw new Error("invalid style type: url = #{name}, type = #{style.data?.type}")
    unless style.data.stylesheet?.rules?
      throw new Error("invalid style object: url = #{name}")
    removeGarbageSelectorsFromStyle(docs, style)
  return

loadStyles = (docs) ->
  styles = {} # { "stylePath": { docs: [0], data: { ... } } }
  docs.forEach (doc, i) ->
    puts "target html [#{i}]: #{doc.path}"
    doc.$('link[rel="stylesheet"]').each ->
      stylePath = path.join(path.dirname(doc.path), doc.$(this).attr('href'))
      unless styles[stylePath]
        styles[stylePath] =
          docs: [],
          data: cssParse(fs.readFileSync(stylePath, 'UTF-8'))
        puts "loaded css: #{stylePath}"
      styles[stylePath].docs.push(i)
      doc.stylePaths.push(stylePath)
      return
  removeGarbageSelectors(docs, styles)
  removeGarbageProperties(docs, styles)
  styles

loadHtml = (htmlPath, fn) ->
  jsdom.env(
    fs.readFileSync(htmlPath, 'UTF-8'),
    ['http://code.jquery.com/jquery.js'],
    fn
  )

loadHtmls = (htmlPaths, fn) ->
  size = htmlPaths.length
  docs = new Array(size) # [ { $: jQuery, path: "html/path", stylePaths: ["style/path"] } ]
  htmlPaths.forEach (htmlPath, i) ->
    puts "load html [#{i}]: #{htmlPath}"
    loadHtml htmlPath, (errors, window) ->
      puts "loaded html [#{i}]: #{htmlPath}"
      if errors
        puts errors.join("\n")
        process.exit()
      docs[i] =
        $: window.$
        path: htmlPath
        stylePaths: []
      fn(docs, loadStyles(docs)) unless --size

module.exports.run = ->
  htmlPaths = process.argv.slice(2)
  usage() unless htmlPaths.length
  loadHtmls htmlPaths, (docs, styles) ->
    for name, style of styles
      fs.writeFile(name, cssStringify(style.data))
      # puts "file: #{name}"
      # puts cssStringify(style.data)
      # puts ''
    return
