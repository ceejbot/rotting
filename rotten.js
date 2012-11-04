#!/usr/bin/env node
var
	async = require('async'),
	colors = require('colors')
	exec = require('child_process').exec,
	path = require('path')
	;
var optimist =
    require('optimist')
        .alias('h', 'help')

        .alias('r', 'repo')
        .default('r', process.cwd())
        .describe('r', 'the repo you\'d like to examine for rotting code')

        .alias('p', 'prod')
        .default('p', 'master')
        .describe('p', 'the branch you have running in production')

        .alias('c', 'mostcommits')
        .default('c', false)
        .describe('c', 'show branches with the most commits first (defaults to showing oldest commits first)')

        .usage('Usage: $0 --repo /path-to-git-repo --prod master')
        ;

var argv = optimist.argv;
if (argv.help) {
    console.log(optimist.help());
    return;
}

var repoDir = path.resolve(__dirname, argv.repo);
var prod = argv.prod;

function git(args, cb) {
    // args = '--git-dir ' + repoDir + '/.git ' + args;
    // console.log('git ' + args);
    // return exec([ 'git', args ], cb)
    return exec('git ' + args, { cwd: repoDir }, cb);
}
function trim(s) { return s.trim(); }
function identity(s) { return s; }

function spacepad(input, padto, onRight) {
    var out = '' + input;
    while (out.length < padto) {
        if (onRight)
            out += ' ';
        else
            out = ' ' + out;
    }
    return out;
}

function handleError(err) {
    if (/spawn Unknown system errno 23/.test(err.message)) {
        console.log('Does branch ' + prod.magenta + ' exist in this repo?');
    } else {
        console.log('\n', new Error(err.message).stack);
        console.log('Please report this bug at https://github.com/ceejbot/rotten .');
    }
}

function main () {
    console.log('Running against', repoDir.magenta);
    console.log('Checking branches against production branch', prod.magenta);

    var merged = [];
    var notMerged = [];
    var partiallymerged = [];
    var longestName = 0;

    function reportAndExit(err) {
        if (err) {
        	console.log(err);
            handleError(new Error(err.message).stack);
        }

        console.log('');
        if (merged.length) {

            merged = merged.reverse();
            console.log('\nHarvested branches:');
            merged.forEach(function (info) {
                console.log('    ' + info.branch.green);
            });

            console.log('\nTo delete all the harvested branches:');
            var deleteThese =
                merged.map(function (info) {
                    var branchName = info.branch.replace(/(.*\/)/, ''); // take everything after the slash
                    return 'git push origin :' + branchName.green + '; git branch -D ' + branchName.green + ';';
                })
                .join('\n');
            console.log(deleteThese);
            console.log('\n');
        } else {
            console.log('No harvested branches remaining to delete. ');
        }

        if (notMerged.length) {
            console.log('Branches not merged into production:'.red);
            if (argv.mostcommits) {
                notMerged.sort(function (a, b) {
                    return b.commits.length - a.commits.length;
                });
            } else {
                // oldest first
                notMerged.sort(function (a, b) {
                    return a.commits[0].committertimestamp - b.commits[0].committertimestamp;
                });
            }

            notMerged.forEach(function (info) {
                var latest = info.commits[0];
                var message = ' ';
                message += spacepad(info.commits.length, 5);
                message += ' ';
                message += spacepad(info.branch, longestName, true).red;
                console.log(message + ' updated %s by %s'
                    , latest.authordateago, latest.committer.green);
            });
        } else {
            console.log('All branches have been fully merged into ' + prod.magenta + '.');
        }

        console.log('\nSummary:');
        console.log('    rotting branches: ' + notMerged.length.toString().red);
        console.log('    harvested branches: ' + merged.length.toString().green);
        process.exit(0);
    }


    git('branch -r', function (err, stdout, stderr) {
        if (err) {
        	handleError(new Error(err.message).stack);
        }

        var branches = stdout.split('\n').map(trim).filter(identity);
        var prodRegex = new RegExp('/' + prod + '$');
        var dot = 0;

        async.forEach(branches, function (branch, cb) {
            if (prodRegex.test(branch))
                return cb(); // ignore e.g. origin/master
            if (dot++ % 5 === 0)
                process.stdout.write('.');

            // git log dt-bsr --not --remotes="*/release" --format="%H | %ae | %ce | %ar | %cr | %ct"
            git('log ' + branch + ' --not --remotes="*/' + prod + '" --format="%H | %ae | %ce | %ar | %cr | %ct"', function (err, stdout, stderr) {
                if (err)
                    console.log('\n', new Error(err.message).stack);

                var commits = stdout.split('\n').map(trim).filter(identity).map(function (s) {
                    var fields = s.split(' | ');
                    return {
                        sha: fields[0]
                        , author: fields[1]
                        , committer: fields[2]
                        , authordateago: fields[3]
                        , committerdateago: fields[4]
                        , committertimestamp: fields[5] // unix timestamp
                    };
                });
                if (commits.length === 0) {
                    merged.push({ branch: branch, commits: commits });
                } else {
                    notMerged.push({ branch: branch, commits: commits });
                    if (branch.length > longestName)
                        longestName = branch.length;
                }
                cb();
            });
        }, reportAndExit);
    });
}

process.on('uncaughtException', function (err) {
    if (err)
        handleError(new Error(err.message).stack);
    process.exit(1);
});

if (require.main === module) {
    main();
}
