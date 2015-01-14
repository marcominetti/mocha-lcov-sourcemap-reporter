
/**
 * Expose `LCov`.
 */

exports = module.exports = LCov;

var fs = require('fs');
var path = require('path');
var sourcemap = require('source-map');

/**
 * Initialize a new LCOV reporter.
 * File format of LCOV can be found here: http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php
 * The reporter is built after this parser: https://raw.github.com/SonarCommunity/sonar-javascript/master/sonar-javascript-plugin/src/main/java/org/sonar/plugins/javascript/coverage/LCOVParser.java
 *
 * @param {Runner} runner
 * @api public
 */

function LCov(runner) {
  runner.on('end', function(){
    var cov = global._$jscoverage || {};

    for (var filename in cov) {
      var data = cov[filename];
      reportFile(filename, data);
    }
  });
}

function reportFile(filename, data) {
  var sourcemap_filename = null;
  var sourcemap_data = null;
  var sourcemap_consumer = null;
  var coverage_data = null;

  // getting loaded source code (guessing it is the generated/augemented one)
  var generated_code = fs.readFileSync(filename).toString();

  // checking whether there is the sourcemap URL hardcoded inside the code
  var sourcemap_ref_regexp = /\/\/\#\s*sourceMappingURL\=(.*?)(?=\n|$)/gi;
  var sourcemap_ref_result = sourcemap_ref_regexp.exec(generated_code);
  if (sourcemap_ref_result != null && sourcemap_ref_result.length === 2) {
    // getting the hardcoded sourcemap file name and resolving it against source file path
    sourcemap_filename = path.resolve(path.dirname(filename),sourcemap_ref_result[1]);
    // loading the file if exists otherwise we unset the sourcemap_filename variable to enable further checks
    if (fs.existsSync(sourcemap_filename) === true) {
      sourcemap_data = fs.readFileSync(sourcemap_filename).toString();
    } else {
      sourcemap_filename == null;
    }
  }
  // if not yet found, checking whether the sourcemap file exists in the same folder
  if (sourcemap_filename == null){
    sourcemap_filename = filename+'.map';
    if (fs.existsSync(sourcemap_filename) === true) {
      sourcemap_data = fs.readFileSync(sourcemap_filename).toString();
    } else {
      sourcemap_filename == null;
    }
  }

  // creating instance of SourceMapConsumer with sourcemap file data if any
  if (sourcemap_data != null) {
    sourcemap_consumer = new sourcemap.SourceMapConsumer(sourcemap_data);

    coverage_data = {};
    //process.stdout.write('working on ' + filename + '\n');
    //process.stdout.write('lines: ' + data.source.length + '\n');
    data.source.forEach(function(line, num) {
      num++;
      if (data[num] !== undefined) {
        var skip_white_chars = (/^\s*/gi).exec(line);
        if (skip_white_chars == null) {
          skip_white_chars = 0;
        } else {
          skip_white_chars = skip_white_chars[0].length;
        }
        var original_position = sourcemap_consumer.originalPositionFor({ line: num, column: skip_white_chars+1 });
        var original_filename = null;
        var original_num = null;
        if (original_position.line != null){
          //process.stdout.write('line ' + num + ' were in ' + original_position.source + ' at ' + original_position.line + '\n');
          original_filename = original_position.source.replace(/^file\:\/\//gi,'');
          original_num = original_position.line;
          coverage_data[original_filename]=coverage_data[original_filename]||[];
          if (coverage_data[original_filename].hasOwnProperty('source') === false && fs.existsSync(original_filename) === true){
            coverage_data[original_filename].source = fs.readFileSync(original_filename).toString().split('\n');
          }
          if (coverage_data[original_filename][original_num] !== undefined) {
            if (coverage_data[original_filename][original_num] === 0 && data[num] > 0){
              coverage_data[original_filename][original_num] = 1;
            }
          } else {
            coverage_data[original_filename][original_num] = (data[num] > 0) ? 1 : 0;
          }

        } else {
          //process.stdout.write('line ' + num + ' didn\'t exist' + '\n');
        }
      }
    });

    for (var found_filename in coverage_data) {
      // generating lcov from patched data
      process.stdout.write('SF:' + found_filename + '\n');
      coverage_data[found_filename].source.forEach(function (line, num) {
        num++;
        if (coverage_data[found_filename][num] !== undefined) {
          process.stdout.write('DA:' + num + ',' + coverage_data[found_filename][num] + '\n');
        }
      });
      process.stdout.write('end_of_record\n');
    }
  } else {
    //process.stdout.write('plain standard file ' + filename);
    // generating lcov from original data
    process.stdout.write('SF:' + filename + '\n');
    data.source.forEach(function(line, num) {
      num++;
      if (data[num] !== undefined) {
        process.stdout.write('DA:' + num + ',' + data[num] + '\n');
      }
    });
    process.stdout.write('end_of_record\n');
  }
}
