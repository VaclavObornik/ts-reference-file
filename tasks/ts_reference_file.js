/*
 * grunt-ts-reference-file
 * https://github.com/ufon/ts-reference-file
 *
 * Copyright (c) 2013 Václav Oborník
 * Licensed under the MIT license.
 */


var path = require("path");
var fs = require("fs");
var os = require("os");
var _ = require('underscore');
var _str = require('underscore.string');
var eol = os.EOL;
var pathSeperator = path.sep;

module.exports = function (grunt) {

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  /**
   * Returns the result of an array inserted into another, starting at the given index.
   */
  function insertArrayAt(array, index, arrayToInsert) {
    var updated = array.slice(0);
    Array.prototype.splice.apply(updated, [index, 0].concat(arrayToInsert));
    return updated;
  }

  // Useful string functions
  // used to make sure string ends with a slash
  function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  }

  function endWithSlash(path) {
    if (!endsWith(path, '/') && !endsWith(path, '\\')) {
      return path + '/';
    }
    return path;
  }

  grunt.registerMultiTask('tsReferenceFile', '', function () {
    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options();


    // Create a reference file?
    var reference = options.dest;
    var referenceFile;
    var referencePath;
    if (!!reference) {
      referenceFile = path.resolve(reference);
      referencePath = path.dirname(referenceFile);
    }
    function isReferenceFile(filename) {
      return path.resolve(filename) == referenceFile;
    }



    var files = grunt.file.expand(options.src);
    if(options.exclude) {
      files = _.difference(files, grunt.file.expand(options.exclude));
    }

    // ignore directories
    files = files.filter(function (file) {
      var stats = fs.lstatSync(file);
      return !stats.isDirectory();
    });

    // Clear the files of output.d.ts and reference.ts
    files = _.filter(files, function (filename) {
      return (!isReferenceFile(filename) && !endsWith(filename, 'd.td'));
    });

    updateReferenceFile(files, referenceFile, referencePath);


    // Converts "C:\boo" , "C:\boo\foo.ts" => "./foo.ts"; Works on unix as well.
    function makeReferencePath(folderpath, filename) {
      return path.relative(folderpath, filename).split('\\').join('/');
    }

    // Updates the reference file
    function updateReferenceFile(files, referenceFile, referencePath) {
      var referenceIntro = '/// <reference path="';
      var referenceEnd = '" />';
      var referenceMatch = /\/\/\/ <reference path=\"(.*?)\"/;
      var ourSignatureStart = '//grunt-start';
      var ourSignatureEnd = '//grunt-end';

      var lines = []; // All lines of the file
      var origFileLines = []; // The lines we do not modify and send out as is. Lines will we reach grunt-ts generated
      var origFileReferences = []; // The list of files already there that we do not need to manage

      // Location of our generated references
      // By default at start of file
      var signatureSectionPosition = 0;

      // Read the original file if it exists
      if (fs.existsSync(referenceFile)) {
        lines = fs.readFileSync(referenceFile).toString().split('\n');

        var inSignatureSection = false;

        // By default our signature goes at end of file
        signatureSectionPosition = lines.length;

        for (var i = 0; i < lines.length; i++) {

          var line = _str.trim(lines[i]);

          // Skip logic for our generated section
          if (_str.include(line, ourSignatureStart)) {
            //Wait for the end signature:
            signatureSectionPosition = i;
            inSignatureSection = true;
            continue;
          }
          if (_str.include(line, ourSignatureEnd)) {
            inSignatureSection = false;
            continue;
          }
          if (inSignatureSection) continue;

          // store the line
          origFileLines.push(line);

          // Fetch the existing reference's filename if any:
          if (_str.include(line, referenceIntro)) {
            var match = line.match(referenceMatch);
            var filename = match[1];
            origFileReferences.push(filename);
          }
        }
      }

      // Put in the generated files
      var generatedFiles = _.map(generatedFiles, function (file) {
        return referenceIntro + makeReferencePath(referencePath, file) + referenceEnd + generatedSignature;
      });
      var contents = insertArrayAt([ourSignatureStart], 1, generatedFiles);

      // Put in the new / observed missing files:
      files.forEach(function (filename) {
        // The file we are about to add
        var filepath = makeReferencePath(referencePath, filename);

        // If there are orig references
        if (origFileReferences.length) {
          if (_.contains(origFileReferences, filepath)) {
            return;
          }
        }

        // Finally add the filepath
        contents.push(referenceIntro + filepath + referenceEnd);
      });
      contents.push(ourSignatureEnd);

      // Modify the orig contents to put in our contents
      var updatedFileLines = insertArrayAt(origFileLines, signatureSectionPosition, contents);
      fs.writeFileSync(referenceFile, updatedFileLines.join(eol));

      // Return whether the file was changed
      if (lines.length == updatedFileLines.length) {
        var updated = false;
        for (var i = 0; i < lines.length; i++) {
          if (lines[i] != updatedFileLines[i]) {
            updated = true;
          }
        }
        return updated;
      }
      else {
        return true;
      }
    }
  });
}
