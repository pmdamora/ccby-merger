#! /usr/bin/env node
var chalk = require('chalk'); // for outputting pretty text
var shell = require("shelljs"); // for running shell commands
var async = require('async');
var tmp = require('tmp'); // for temporary files
var fs = require('fs');
var inquirer = require('inquirer'); // for command-line prompts
var argv = require('yargs')
        .usage('Usage: $0 [options]')
        .demandOption(['d', 'i'])
        .argv;
var path = require('path')

// Define variables
var ccLength = 5;
var tempDir = './temp';
var assetsDir = argv.d
var imageLoc = argv.i;
var assetTypes = ['.mp4'];

// Create output directory
var outputDir = './output';
if (argv.o) {
    outputDir = argv.o;
}
if (!fs.existsSync('output')){
    fs.mkdirSync('output');
}

// Define a function to add a ccby to the end of a given source video
addCCVid = function(source_ccby, source_vid, output_loc) {
    // Create temp files and directories
    if (!fs.existsSync(tempDir)){
        fs.mkdirSync(tempDir);
    }
    var ccby_vid = tmp.tmpNameSync({ template:  tempDir + '/ccby-XXXXXX' }) + ".mp4";
    var ccby_vid_snd = tmp.tmpNameSync({ template:  tempDir + '/ccby-XXXXXX' }) + ".mp4";
    var intermediate = {};
    intermediate.one = tmp.tmpNameSync({ template:  tempDir + '/ccby-XXXXXX' }) + ".ts";
    intermediate.two = tmp.tmpNameSync({ template:  tempDir + '/ccby-XXXXXX' }) + ".ts";

    async.series([
        // Create video from static ccby image
        function(callback) {
            shell.exec("ffmpeg -loop 1 -i " + source_ccby + " -t " + ccLength + " -r 1 -c:v \
                        libx264 -pix_fmt yuv420p " + ccby_vid + " -y -loglevel panic",
            function(err) {
                if (err) return callback(err);
                console.log(chalk.dim('ccby:  ') + chalk.bgGreen.black('SUCC') +
                            ' Video created at ' + chalk.bold(ccby_vid));
                callback();
            });
        },
        // Add a null audio track to the video file
        function(callback) {
            shell.exec("ffmpeg -f lavfi -i anullsrc=r=48000 -i " + ccby_vid + " -to 00:00:0"
                        + ccLength + " -c:v copy -c:a aac -strict experimental " +
                        ccby_vid_snd + " -y -loglevel panic",
            function(err) {
                if (err) return callback(err);
                console.log(chalk.dim('ccby:  ') + chalk.bgGreen.black('SUCC') +
                            ' Null audio track added to ' + chalk.bold(ccby_vid_snd));
                callback();
            });

        },
        // Create intermediate video files
        function(callback) {
            async.parallel([
                function(callback) {
                    shell.exec("ffmpeg -i " + source_vid + " -c copy -bsf:v h264_mp4toannexb \
                    -f mpegts " + intermediate.one + " -y -loglevel panic",
                    function(err) {
                        if (err) return callback(err);
                        console.log(chalk.dim('ccby:  ') + chalk.bgGreen.black('SUCC') +
                                    ' Intermediate file created at ' + chalk.bold(intermediate.one));
                        callback();
                    });
                },
                function(callback) {
                    shell.exec("ffmpeg -i " + ccby_vid_snd + " -c copy -bsf:v \
                    h264_mp4toannexb -f mpegts " + intermediate.two + " -y -loglevel panic",
                    function(err) {
                        if (err) return callback(err);
                        console.log(chalk.dim('ccby:  ') + chalk.bgGreen.black('SUCC') +
                                    ' Intermediate file created at ' + chalk.bold(intermediate.two));
                        callback();
                    });
                }
            ],
            function(err) {
                if (err) return callback(err);
                callback();
            });
        },
        // Merge the two video files and save the result
        function(callback) {
            shell.exec('ffmpeg -i "concat:' + intermediate.one + '|' + intermediate.two + '" \
            -c copy -bsf:a aac_adtstoasc ' + output_loc + ' -y -loglevel panic',
            function(err) {
                if (err) return callback(err);
                console.log(chalk.dim('ccby:  ') + chalk.bgGreen.black('SUCC') +
                            ' Video files merged. Output located at ' + chalk.bold(output_loc));
                callback();
            });
        }
    ], function(err) {
            if (err) {
                console.log(chalk.dim('ccby:  ') + chalk.bgRed.black('ERR') +
                            ' An error has occurred while attempting to merge video files: '
                            + err.message);
            }
    });
}

// Define a function to clean a directory
rmDir = function(dirPath, removeSelf) {
        if (removeSelf === undefined)
            removeSelf = true;
        try { var files = fs.readdirSync(dirPath); }
        catch(e) { return; }
        if (files.length > 0)
            for (var i = 0; i < files.length; i++) {
                var filePath = dirPath + '/' + files[i];
                if (fs.statSync(filePath).isFile())
                    fs.unlinkSync(filePath);
                else
                    rmDir(filePath);
            }
        if (removeSelf)
            fs.rmdirSync(dirPath);
};

// Join a path, normalize separators (no duplicates)
function pathJoin(parts, sep){
   var separator = sep || '/';
   var replace   = new RegExp(separator+'{1,}', 'g');
   return parts.join(separator).replace(replace, separator);
}


// Here we perform the normal operation of the program
// Perform the operation on the entire folder
if (argv.a) {
    console.log(chalk.dim('ccby:  ') + 'Gathering folder contents');
    // Read the contents of the folder
    fs.readdir(assetsDir, function(err, items) {
        // Print out the list
        for (var i=0; i<items.length; i++) {
            // Only return items that are of the correct file type
            if (assetTypes.indexOf(path.extname(items[i])) > -1) {
                console.log(chalk.bold("\t" + items[i]));
            } else {
                // Remove the items of the wrong filetype
                // Decrement i to reflect the change
                items.splice(items.indexOf(items[i]), 1);
                i--;
            }
        }
        // Confirm that the user would like to proceed
        inquirer.prompt([
            {
                type: 'list',
                name: 'cont',
                message: 'Would you like to add a CC to the above files?',
                default: 'Yes',
                choices: [
                'Yes',
                'No',
                ]
            }
        ]).then(function (answers) {
            //console.log(JSON.stringify(answers, null, '  '));
            if (answers.cont == "Yes") {
            // Loop through the entire list of items and add a CCBY
                for (var i=0; i<items.length; i++) {
                    addCCVid(imageLoc, pathJoin([assetsDir, items[i]]), pathJoin([outputDir, items[i]]));
                }
            } else {
                console.log("TODO: Ask for a new directory or something");
            }
        });
    });
// Perform the operation on an individual file
} else {
    console.log("TODO: Perform on individual file");
}

console.log(chalk.dim('ccby:  ') + chalk.bgGreen.black('SUCC') + ' Temporary files cleaned');
rmDir(tempDir);
