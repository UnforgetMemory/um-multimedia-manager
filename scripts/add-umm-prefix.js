#!/usr/bin/env node
/**
 * Add umm- prefix to Tailwind utility classes in Vue and TypeScript files
 * 
 * Usage: node scripts/add-umm-prefix.js
 * 
 * Processes:
 * - .vue files: class="..." attributes
 * - .ts files: cva() class strings in quotes
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

// Tailwind utility class patterns (not custom classes like font-display)
const TAILWIND_PATTERNS = [
  // Layout
  /\b(block|inline-block|inline-flex|inline-grid|flex|grid|table|hidden|contents|list-item)\b/g,
  // Flexbox & Grid
  /\b(flex-row|flex-col|flex-wrap|flex-nowrap|flex-1|flex-auto|flex-none|flex-grow|flex-shrink|flex-0|flex-[0-9]+)\b/g,
  /\b(items-start|items-end|items-center|items-baseline|items-stretch)\b/g,
  /\b(self-start|self-end|self-center|self-baseline|self-stretch)\b/g,
  /\b(justify-start|justify-end|justify-center|justify-between|justify-around|justify-evenly)\b/g,
  /\b(gap-[0-9]+|gap-x-[0-9]+|gap-y-[0-9]+)\b/g,
  // Spacing
  /\b(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me)-[0-9]+/g,
  /\b(p|px|py|pt|pr|pb|pl|ps|m|mx|my|mt|mr|mb|ml|ms|me)-\[[^\]]+\]/g,
  /\b(space-x|space-y)-[0-9]+/g,
  // Sizing
  /\b(w|h|min-w|min-h|max-w|max-h)-[0-9]+/g,
  /\b(w|h|min-w|min-h|max-w|max-h)-\[[^\]]+\]/g,
  /\b(w|h|min-w|min-h|max-w|max-h)-(auto|full|screen|svw|svh|lvw|lvh|dvw|dvh)\b/g,
  /\b(size-[0-9]+|size-\[[^\]]+\]|size-(auto|full|screen))\b/g,
  // Typography
  /\b(text-xs|text-sm|text-base|text-lg|text-xl|text-2xl|text-3xl|text-4xl|text-5xl|text-6xl|text-7xl|text-8xl|text-9xl)\b/g,
  /\b(font-thin|font-light|font-normal|font-medium|font-semibold|font-bold|font-extrabold|font-black)\b/g,
  /\b(italic|not-italic|uppercase|lowercase|capitalize|normal-case)\b/g,
  /\b(truncate|text-ellipsis|text-clip|line-clamp-[0-9]+)\b/g,
  /\b(leading-[0-9]+|leading-none|leading-tight|leading-snug|leading-normal|leading-relaxed|leading-loose)\b/g,
  /\b(tracking-tight|tracking-normal|tracking-wide|tracking-wider|tracking-widest)\b/g,
  // Backgrounds
  /\b(bg|bg-opacity|bg-blend)-(transparent|black|white|current|inherit|unset)\b/g,
  /\b(bg|bg-opacity)-(red|orange|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]+/g,
  /\b(bg|bg-opacity)-\[[^\]]+\]/g,
  // Borders
  /\b(border|border-t|border-r|border-b|border-l|border-x|border-y|border-s|border-e)-[0-9]+/g,
  /\b(border|border-t|border-r|border-b|border-l|border-x|border-y|border-s|border-e)-(solid|dashed|dotted|double|none)\b/g,
  /\b(border-(?:t|r|b|l|x|y|s|e)?)\b/g,
  /\b(rounded|rounded-t|rounded-r|rounded-b|rounded-l|rounded-tl|rounded-tr|rounded-bl|rounded-br|rounded-s|rounded-e|rounded-ss|rounded-se|rounded-ee|rounded-es)-[a-z0-9]+/g,
  // Effects
  /\b(shadow|shadow-sm|shadow-md|shadow-lg|shadow-xl|shadow-2xl|shadow-inner|shadow-none)\b/g,
  /\b(opacity-[0-9]+)\b/g,
  /\b(blur-[0-9]+|blur-none|blur-sm|blur-md|blur-lg|blur-xl|blur-2xl|blur-3xl)\b/g,
  // Transforms
  /\b(scale-[0-9]+|scale-x-[0-9]+|scale-y-[0-9]+)\b/g,
  /\b(rotate-[0-9]+|rotate-\[[^\]]+\])\b/g,
  /\b(translate-[0-9]+|translate-x-[0-9]+|translate-y-[0-9]+)\b/g,
  // Transitions
  /\b(transition|transition-all|transition-colors|transition-opacity|transition-shadow|transition-transform)\b/g,
  /\b(duration-[0-9]+)\b/g,
  /\b(ease-[a-z]+)\b/g,
  // Interactivity
  /\b(cursor-[a-z]+)\b/g,
  /\b(select-none|select-text|select-all|select-auto)\b/g,
  /\b(placeholder-[a-z]+)\b/g,
  // Positioning
  /\b(static|fixed|absolute|relative|sticky)\b/g,
  /\b(inset-[0-9]+|inset-x-[0-9]+|inset-y-[0-9]+|top-[0-9]+|right-[0-9]+|bottom-[0-9]+|left-[0-9]+)\b/g,
  // Z-index
  /\b(z-[0-9]+|z-auto)\b/g,
  // Display
  /\b(visible|invisible|collapse)\b/g,
  // Overflow
  /\b(overflow-[a-z]+|overflow-x-[a-z]+|overflow-y-[a-z]+)\b/g,
  // Pointer events
  /\b(pointer-events-[a-z]+)\b/g,
  // User select
  /\b(user-select-[a-z]+)\b/g,
  // Appearance
  /\b(appearance-[a-z]+)\b/g,
  // List style
  /\b(list-[a-z]+)\b/g,
  // Text alignment
  /\b(text-[a-z]+)\b/g,
  // Vertical alignment
  /\b align-[a-z]+/g,
  // Whitespace
  /\bwhitespace-[a-z]+/g,
  // Word break
  /\b(break-normal|break-words|break-all|break-keep)\b/g,
  // Object fit
  /\b(object-[a-z]+)\b/g,
  // Object position
  /\b(object-[a-z]+-[a-z]+)\b/g,
  // Aspect ratio
  /\b(aspect-[a-z0-9]+)\b/g,
  // Columns
  /\b(columns-[0-9]+)\b/g,
  // Break before/after
  /\b(break-[a-z]+)\b/g,
  // Box decoration
  /\b(box-[a-z]+)\b/g,
  // Isolation
  /\b(isolate|isolation-[a-z]+)\b/g,
  // Will change
  /\b(will-change-[a-z]+)\b/g,
  // Content
  /\bcontent-\[[^\]]+\]\b/g,
  // Ring
  /\b(ring-[0-9]+|ring-inset|ring-[a-z]+-[0-9]+)\b/g,
  // Outline
  /\b(outline-[a-z]+)\b/g,
  // Accent
  /\b(accent-[a-z]+-[0-9]+)\b/g,
  // Caret
  /\b(caret-[a-z]+-[0-9]+)\b/g,
  // Scroll
  /\b(scroll-[a-z]+-[0-9]+)\b/g,
  // Justify items/self
  /\b(justify-items-[a-z]+|justify-self-[a-z]+)\b/g,
  // Place items/self/content
  /\b(place-[a-z]+-[a-z]+)\b/g,
]

const SKIP_PATTERNS = [
  /^umm:/,
]

function addPrefixToClasses(classString) {
  const classes = classString.split(/\s+/).filter(Boolean)
  
  const prefixed = classes.map(cls => {
    if (SKIP_PATTERNS.some(p => p.test(cls))) {
      return cls
    }
    
    const isTailwind = TAILWIND_PATTERNS.some(pattern => {
      pattern.lastIndex = 0
      return pattern.test(cls)
    })
    
    if (isTailwind) {
      return `umm:${cls}`
    }
    
    if (/^(bg|text|font|border|rounded|shadow|hover:|focus:|dark:|active:|disabled:|data-|animate-|mx-|my-|mt-|mb-|ml-|mr-|shrink-|grow-|tabular-|leading-|tracking-|indent-|align-|justify-|place-|content-|self-|overflow-|whitespace-|break-|object-|aspect-|columns-|box-|isolate|will-|content-|ring-|outline-|accent-|caret-|scroll-)/.test(cls)) {
      return `umm:${cls}`
    }
    
    return cls
  })
  
  return prefixed.join(' ')
}

function processVueFile(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  
  let updated = content.replace(
    /(?<!:)class="([^"]*)"/g,
    (match, classes) => {
      return `class="${addPrefixToClasses(classes)}"`
    }
  )
  
  updated = updated.replace(
    /:class="\s*\n?\s*cn\(([\s\S]*?)\)\s*"/g,
    (match, args) => {
      const prefixedArgs = args.replace(
        /(["'])([^"']*)\1/g,
        (m, quote, classes) => {
          if (classes.includes(' ') || /(?:flex|grid|items-|justify-|gap-|p-|m-|text-|bg-|border-|rounded|shadow|size-)/.test(classes)) {
            return `${quote}${addPrefixToClasses(classes)}${quote}`
          }
          return m
        }
      )
      const indentation = match.match(/^\s*/)[0]
      return `${indentation}:class="\n${indentation}  cn(${prefixedArgs})\n${indentation}"`
    }
  )
  
  updated = updated.replace(
    /:class="\s*\n?\s*\[([\s\S]*?)\]\s*"/g,
    (match, items) => {
      const prefixedItems = items.replace(
        /(["'])([^"']*)\1/g,
        (m, quote, classes) => {
          if (classes.includes(' ') || /(?:flex|grid|items-|justify-|gap-|p-|m-|text-|bg-|border-|rounded|shadow|size-|animate-|tabular-|font-|tracking-|leading-)/.test(classes)) {
            return `${quote}${addPrefixToClasses(classes)}${quote}`
          }
          return m
        }
      )
      const indentation = match.match(/^\s*/)[0]
      return `${indentation}:class="\n${indentation}  [${prefixedItems}]\n${indentation}"`
    }
  )
  
  updated = updated.replace(
    /:class="\s*\n?\s*\{([\s\S]*?)\}\s*"/g,
    (match, items) => {
      const prefixedItems = items.replace(
        /(["'])([^"']*)\1/g,
        (m, quote, classes) => {
          if (classes.includes(' ') || /(?:flex|grid|items-|justify-|gap-|p-|m-|text-|bg-|border-|rounded|shadow|size-|animate-|tabular-|font-|tracking-|leading-)/.test(classes)) {
            return `${quote}${addPrefixToClasses(classes)}${quote}`
          }
          return m
        }
      )
      const indentation = match.match(/^\s*/)[0]
      return `${indentation}:class="\n${indentation}  {${prefixedItems}}\n${indentation}"`
    }
  )
  
  updated = updated.replace(
    /cva\(\s*(["'])([^"'\n]+)\1/g,
    (match, quote, classes) => {
      if (classes.includes(' ') || /(?:flex|grid|items-|justify-|gap-|p-|m-|text-|bg-|border-|rounded|shadow)/.test(classes)) {
        return `cva(${quote}${addPrefixToClasses(classes)}${quote}`
      }
      return match
    }
  )
  
  updated = updated.replace(
    /(?:default|secondary|destructive|outline|ghost|link|sm|lg|icon):\s*(["'])([^"'\n]+)\1/g,
    (match, quote, classes) => {
      if (classes.includes(' ') || /(?:flex|grid|items-|justify-|gap-|p-|m-|text-|bg-|border-|rounded|shadow|hover:|focus:)/.test(classes)) {
        return `${match.split(':')[0]}: ${quote}${addPrefixToClasses(classes)}${quote}`
      }
      return match
    }
  )
  
  if (updated !== content) {
    writeFileSync(filePath, updated)
    console.log(`Updated: ${filePath}`)
    return true
  }
  return false
}

function processTsFile(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  
  const updated = content.replace(
    /(["'])([^"'\n]+)\1/g,
    (match, quote, classes) => {
      if (classes.includes(' ') && /(?:flex|grid|items-|justify-|gap-|p-|m-|text-|bg-|border-|rounded|shadow|hover:|focus:|disabled:|data-)/.test(classes)) {
        const prefixed = addPrefixToClasses(classes)
        if (prefixed !== classes) {
          return `${quote}${prefixed}${quote}`
        }
      }
      return match
    }
  )
  
  if (updated !== content) {
    writeFileSync(filePath, updated)
    console.log(`Updated: ${filePath}`)
    return true
  }
  return false
}

function walkDir(dir, callback) {
  const files = readdirSync(dir)
  for (const file of files) {
    const path = join(dir, file)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walkDir(path, callback)
    } else if (extname(file) === '.vue' || extname(file) === '.ts') {
      callback(path)
    }
  }
}

// Main
const uiDir = '/home/um/sourcecode/my/um-multimedia-manager/src/shared/ui'
const optionsDir = '/home/um/sourcecode/my/um-multimedia-manager/src/entrypoints/options'
const popupDir = '/home/um/sourcecode/my/um-multimedia-manager/src/entrypoints/popup'
const customDir = '/home/um/sourcecode/my/um-multimedia-manager/src/shared'
let updatedCount = 0

console.log('Adding umm- prefix to Tailwind classes in shadcn components...\n')

walkDir(uiDir, (file) => {
  const ext = extname(file)
  let updated = false
  if (ext === '.vue') {
    updated = processVueFile(file)
  } else if (ext === '.ts') {
    updated = processTsFile(file)
  }
  if (updated) {
    updatedCount++
  }
})

console.log('\nProcessing options page components...\n')

walkDir(optionsDir, (file) => {
  const ext = extname(file)
  let updated = false
  if (ext === '.vue') {
    updated = processVueFile(file)
  } else if (ext === '.ts') {
    updated = processTsFile(file)
  }
  if (updated) {
    updatedCount++
  }
})

console.log('\nProcessing popup components...\n')

walkDir(popupDir, (file) => {
  const ext = extname(file)
  let updated = false
  if (ext === '.vue') {
    updated = processVueFile(file)
  } else if (ext === '.ts') {
    updated = processTsFile(file)
  }
  if (updated) {
    updatedCount++
  }
})

console.log('\nProcessing custom components...\n')

walkDir(customDir, (file) => {
  const ext = extname(file)
  let updated = false
  if (ext === '.vue') {
    updated = processVueFile(file)
  } else if (ext === '.ts') {
    updated = processTsFile(file)
  }
  if (updated) {
    updatedCount++
  }
})

console.log(`\nDone! Updated ${updatedCount} files.`)
