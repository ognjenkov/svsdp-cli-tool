# SVSDP CLI

A simple CLI tool to package a folder into a `.svsdp` archive.

## 📦 What It Does

Given a folder path, `svsdp` zips its contents into a `.svsdp` file in your current working directory.

## ⚙️ Setup

Set it up in 3 steps:

```bash
npm install
chmod +x cli.js      # Make cli.js executable (only needed for macOS/Linux)
npm link
```

## 💸 How to use

Provide the folder wich you want to pack:

```bash
svsdp package ./folder
```

```bash

// replace - moguci targeti : [element, attribute, string]
// replace:element moguce vrednost : [elements, element, string]
// replace:attribute moguce vrednost : [string]
// replace:text moguce vrednosti : [string]

// addText - moguci targeti : [element, text]
// addText:element moguce vrednost : [string]
// addText:text moguce vrednost : [string]

// addAttribute - moguci targeti : [element]
// addAttribute:element moguce vrednost : [string]

// addElement - moguci targeti: [element]
// addElement:element moguce vrednost : [element, elements]
```
