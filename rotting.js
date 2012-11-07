#!/usr/bin/env node

var
	async = require('async'),
	colors = require('colors'),
	exec = require('child_process').exec,
	path = require('path')
	;

var optimist = require('optimist')
	.alias('h', 'help')

	.alias('r', 'repo')
	.default('r', process.cwd())
	.describe('r', 'the repo to examine for rotting code')

	.alias('p', 'prod')
	.default('p', 'master')
	.describe('p', 'the branch running in production')

	.alias('c', 'commits')
	.default('c', false)
	.describe('c', 'sort rotten branches by commit count instead of age')

	.alias('d', 'deadwood')
	.default('d', false)
	.describe('d', 'show git branch delete commands for all harvested branches')
	
	.alias('f', 'filter')
	.default('f', '')
	.describe('f', 'filter results to branches that contain this string')

	.usage('Usage: $0 --repo /path/to/git/repo --prod master')
	;

var argv = optimist.argv;
if (argv.help)
{
	console.log(optimist.help());
	return;
}

var repoDir = path.resolve(__dirname, argv.repo);
var prod = argv.prod;

function git(args, cb)
{
	// console.log('git ' + args);
	return exec('git ' + args, { cwd: repoDir }, cb);
}
function trim(s) { return s.trim(); }
function identity(s) { return s; }

function spacepad(input, padto, onRight)
{
	var out = '' + input;
	while (out.length < padto)
	{
		if (onRight)
			out += ' ';
		else
			out = ' ' + out;
	}
	return out;
}

function handleError(err)
{
	if (/spawn Unknown system errno 23/.test(err.message))
		console.log('Does branch ' + prod.magenta + ' exist in this repo?');
	else
	{
		console.log('\n', new Error(err.message).stack);
		console.log('Please report this bug at https://github.com/ceejbot/rotten .');
	}
}

function main()
{
	console.log('Running against', repoDir.magenta);
	console.log('Checking branches against production branch', prod.magenta);
	if (argv.filter)
		console.log('Considering only branches matching', argv.filter.magenta);

	var merged = [];
	var notMerged = [];
	var partiallymerged = [];
	var longestName = 0;

	function reportAndExit()
	{
		console.log('\n');
		if (merged.length)
		{
			merged = merged.reverse();
			console.log('Harvested branches:');
			merged.forEach(function (info) { console.log('	 ' + info.branch.green); });

            if (argv.deadwood)
            {
                console.log('\nTo delete all the harvested branches:');
                var deleteThese =
                    merged.map(function (info)
                    {
                        var branchName = info.branch.replace(/(.*\/)/, ''); // take everything after the slash
                        return 'git push origin :' + branchName.green + '; git branch -D ' + branchName.green + ';';
                    }).join('\n');
                console.log(deleteThese);
            }
		}
		else
			console.log('No harvested branches remaining to delete. ');

		console.log('');
		if (notMerged.length)
		{
			console.log('Branches not merged into production:');
			if (argv.commits)
			{
				notMerged.sort(function (a, b) { return b.commits.length - a.commits.length; });
			}
			else
			{
				// oldest first
				notMerged.sort(function (a, b) { return a.commits[0].committerTimestamp - b.commits[0].committerTimestamp; });
			}

			notMerged.forEach(function (info)
			{
				var latest = info.commits[0];
				var message = ' ';
				message += spacepad(info.commits.length, 5);
				message += ' ';
				message += spacepad(info.branch, longestName, true).red;
				console.log(message + ' updated %s by %s', latest.createdRelative, latest.committer.green);
			});
		}
		else
			console.log('All branches have been fully merged into ' + prod.magenta + '.');

		console.log('\nSummary:');
		console.log('	 rotting branches: ' + notMerged.length.toString().red);
		console.log('	 harvested branches: ' + merged.length.toString().green);
		process.exit(0);
	}


	git('branch -r', function (err, stdout, stderr)
	{
		if (err)
		{
			console.log('Error listing branches: ');
			handleError(new Error(err.message).stack);
		}

		var branches = stdout.split('\n').map(trim).filter(identity);

		var productionPattern = new RegExp('/' + prod + '$');
		var filterPattern;
		if (argv.filter.length)
			filterPattern = new RegExp(argv.filter);
		var dot = 0;
		var branch, gitcmd;

		function processBranch(branch, callback)
		{
			if (dot++ % 5 === 0)
				process.stdout.write('.');
			gitcmd = 'log ' + branch + ' --not --remotes="*/' + prod + '" --format="%H | %ae | %ce | %ar | %cr | %ct"';
			git(gitcmd, function(err, stdout, stderr)
			{
				if (err)
				{
					console.log('error handling branch ' + branch.red); // TODO
					console.log(err);
					return callback();
				}
	
				var commits = stdout.split('\n').map(trim).filter(identity).map(function (s)
				{
					var fields = s.split(' | ');
					return {
						sha: fields[0]
						, author: fields[1]
						, committer: fields[2]
						, createdRelative: fields[3]
						, committerRelative: fields[4]
						, committerTimestamp: fields[5] // unix timestamp
					};
				});
				if (commits.length === 0)
					merged.push({ branch: branch, commits: commits });
				else
				{
					notMerged.push({ branch: branch, commits: commits });
					if (branch.length > longestName)
						longestName = branch.length;
				}
				callback();
			});
		}

		// filter branches for matches
		var interesting = branches.filter(function(b)
		{
			if (!productionPattern.test(b) && (!filterPattern || filterPattern.test(b)))
				return b;
		});
		async.forEachLimit(interesting, 50, processBranch, reportAndExit);
	});
}

if (require.main === module)
{
	main();
}
