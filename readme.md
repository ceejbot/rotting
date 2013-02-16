# How rotten is your git repo?

- How many branches have how many commits waiting to get into master?
- How much code is **rotting** in remote branches, waiting for release?
- How many harvested branches are sitting around occupying space in your repo?

Try it out.

```sh
$ npm -g install rotting
$ cd ~/source/redback
$ rotting -d

Running against /Users/ceej/source/redback
Checking branches against production branch master
.

Harvested branches:
	 origin/keypair-multiget

To delete all the harvested branches:
git push origin :keypair-multiget; git branch -D keypair-multiget;

All branches have been fully merged into master.

Summary:
	 rotting branches: 0
	 harvested branches: 1
```

My most common usage pattern for this tool is to look for branches that include my username, to make sure I'm cleaning up as I work. You can grep the output if you like, or use the `--filter` option to consider only branches matching the given pattern. E.g., `rotting -prod release -f biz\|ceej`.

## Usage

```
Usage: rotting --repo /path/to/git/repo --prod master

Options:
  -r, --repo      the repo to examine for rotting code                        [default: "."]
  -p, --prod      the branch running in production                            [default: "master"]
  -c, --commits   sort rotten branches by commit count instead of age         [default: false]
  -d, --deadwood  show git branch delete commands for all harvested branches  [default: false]
  -f, --filter    filter results to branches that contain this string         [default: ""]
```

By default rotten branches are sorted by age, with the oldest unharvested branch shown first. You can instead sort by the number of unharvested commits by passing the `--commits` option.

## Credits

Original rotting script called `rotten` by [David Trejo](http://dtrejo.com/) over [in his repo](https://github.com/DTrejo/rotten).

## License

MIT.
