#!/usr/bin/perl
# Inspired by latexpand by D. Musliner, University of Michigan
# 2012-2023: Matthieu Moy <git@matthieu-moy.fr>
# BSD License

use strict;
use Cwd;
use Getopt::Long;
use IO::Handle;
use File::Spec;

my $TEXINPUTS = $ENV{'TEXINPUTS'};
# By default, search in current directory. We use '.' and not getcwd()
# to avoid issues if the working directory contains a ':' character.
if (!$TEXINPUTS) { $TEXINPUTS = '.'; }

my $verbose;
my $keep_comments;
my $keep_includes;
my $empty_comments;
my $help;
my $long_help;
my %defines = ();
my $output;
my $explain;
my $show_graphics;
my $graphics_extensions = ":.pdf:.png:.jpg:.eps";
my $expand_usepackage;
my $expand_bbl;
my $biber;
my $fatal;
my $version;
my $makeatletter;
my $inside_import;
my $in_enc = "bytes";
my $out_enc = "bytes";

GetOptions (
	'h' => \$help,
	'help' => \$long_help,
	'verbose|v' => \$verbose,
	'keep-comments' => \$keep_comments,
	'keep-includes' => \$keep_includes,
	'empty-comments' => \$empty_comments,
	'define|d=s%' => \%defines,
	'output|o=s' => \$output,
	'explain' => \$explain,
	'show-graphics' => \$show_graphics,
	'graphics-extensions' => \$graphics_extensions,
	'expand-usepackage' => \$expand_usepackage,
	'expand-bbl=s' => \$expand_bbl,
	'biber=s' => \$biber,
	'fatal' => \$fatal,
	'version' => \$version,
        'makeatletter' => \$makeatletter,
	'in-encoding=s' => \$in_enc,
	'out-encoding=s' => \$out_enc,
) or pod2usage_wrapper(2);
version() if $version;
pod2usage_wrapper(0) if $help;
pod2usage_wrapper(-exitstatus => 0, -output => \*STDOUT, -verbose => 2) if $long_help;

sub pod2usage_wrapper
{
	# Like pod2usage, but fall back to a simpler implem in case
	# pod2usage can't be found.
	if  (eval {require Pod::Usage;1;} ne 1) {
		print "Please install perldoc and Pod::Usage to get proper help.\n";
		my $started = 0;
		open (my $in, '<', "$0") or die $!;
		while (<$in>) {
			if ($started) {
				print;
			}
			if (/^__END__$/) {
				$started = 1;
			}
		}
	} else {
		Pod::Usage->import();
		pod2usage(@_);
	}
}

sub get_version
{
	# $VERSION's value will be substituted by 'make dist', but the
	# next line won't (the string has to be broken to avoid it).
	my $VERSION = '@LATEXPAND_VERSION@';
	if ($VERSION eq '@LATEXPAND' . '_VERSION@') {
		my($vol,$dir,$file) = File::Spec->splitpath($0);
		chdir($dir);
		$VERSION = `git describe --tags HEAD 2>/dev/null`;
	}
	if ($VERSION eq '') {
		$VERSION = '<unknown version>';
	}
	$VERSION =~ s/^\s+|\s+$//g;
	return $VERSION;
}

sub version
{
	print "latexpand version ". get_version() .".\n";
	exit(0);
}

my $nl = "";
if ($empty_comments) {
	$nl = "%\n";
}

if ($output && $output ne "-") {
	open (my $OUTPUT, '>', "$output") or die $!;
	STDOUT->fdopen(\*$OUTPUT, 'w') or die $!;
}

sub say
{
	if ($verbose) {
		print STDERR "$_[0]";
	}
}

my $makeatletter_found;
my $in_preamble;

use open IN  => ":$in_enc", OUT => ":$out_enc";

foreach my $file (@ARGV)
{
	say "processing $file\n";
	$makeatletter_found = 0;
	$in_preamble = 1;
        $inside_import = "";
        if ($file =~ /\.bib$/) {
                warn "WARNING: latexpand is not meant to be used on BibTeX files like '$file'.\n" .
                        "    Run latexpand on your main .tex file, using '--expand-bbl FILE'\n" .
                        "    or '--biber FILE' if needed to inline the generated bbl file.\n";
        } elsif (not $file =~ /\.tex$/) {
                warn "WARNING: latexpand is meant to be used on .tex files, which $file isn't.\n";
        }
	process_file($file, "  ");
}

sub cat_file
{
	my $file = shift;
	open (my $INFILE, "<", $file) || die "could not open input file '$file'\n";
	while (<$INFILE>) {
		print;
	}
	close ($INFILE);
}

sub process_file
{
	my $file = shift;
	my $prefix = (shift || "");
	my $in_comment = 0;
	open(my $FILE, "<", $file) or die "could not open input file '$file'\n";
	my $commented_newline = 0;
	while (my $line = <$FILE>) {
		if ($line =~ /^[ \t]*\\endinput/) {
			# Surprisingly, text after \endinput on the
			# same line is kept in output. Also, add a
			# space (before %), automatically inserted by
			# TeX at the end of file.
			$line =~ s/\\endinput(.*)\n?/$1 % /;
			$in_comment = 1;
			process_line($line, $prefix, \$commented_newline);
			last;
		}
		while (my ($k, $v) = each (%defines))
		{
			$line=~s!\\$k!$v!g;
		}
		process_line($line, $prefix, \$commented_newline, $file);
		if ($line =~ /^%.*[^\n]\z/ || $line =~ /[^\\]%.*[^\n]\z/) {
			# file ends with a comment not ending with a newline
			print "\n";
		}
		# Garbage at end of line after \end{document} is
		# ignored by LaTeX, but we don't allow anything before
		# to avoid e.g. \verb|\end{document}| from terminating
		# the file.
		if (!$keep_comments && $line =~ /^[ \t]*\\end\{document\}/) {
			last;
		}
	}
	close($FILE);
	return $in_comment;
}

sub process_line
{
	my ($line, $prefix, $commented_newline, $file) = @_;
	$_ = $line;
	if ($$commented_newline) {
		# Leading whitespaces after a comment is ignored.
		# There's no space in:
		# Line 1%
		#    Line 2.
		# Match just space and tabs (\s would match \n)
		s/^[ \t]*//;
		if (/^$/) {
			# Deal with:
			#
			# Line 1 % comment
			#
			# Line 2
			#
			# The newline after Line 1 is commented, but we still
			# want a new paragraph. We strip the comment together
			# with its newline, but re-add a newline to chnge
			# paragraph here if needed:
			print "\n";
		}
	}
	$$commented_newline = 0;
	# Consider \makeatletter only in preamble, because we do want
	# to warn on \someCommand{\makeatletter\command@with@arobase}.
	if ($in_preamble && /^[^%]*\\makeatletter/) {
		$makeatletter_found = 1;
	}
	if ($in_preamble && /^[^%]*\\makeatother/) {
		$makeatletter_found = 0;
	}
	my $command;
	if (!$makeatletter && !$makeatletter_found
	    && (($command) = /^[^%]*(\\[[:alpha:]]*@[[:alpha:]]*)/)
	    && ($command ne '\@')) {
		print STDERR "Warning: command $command containing @ found in\n";
		print STDERR "Warning: $file.\n";
		print STDERR "Warning: consider using --makeatletter if the result is not compilable.\n";
	}

	# non-comment is a sequence of:
	# - escaped character (\\.), including \% and \\
	# - neither '%' nor '\'.
	my $NON_COMMENT = '([^\\\\%]|\\\\.)*';

	unless ($keep_comments) {
		# Special-case for \url{} commands, which may contain '%'
		# characters. It's hard to catch them in $NON_COMMENT since we'd
		# need a regexp so that "\url{foo" can't match as non-comment in
		# the line \url{foo%bar}, but "\url{foo%bar}" would match.
		# Escaping these '%' is not mandatory, but allowed, hence we can
		# pre-process the line by escaping them, and let latexpand work
		# as normal afterwards.
		# Known limitation: latexpand doesn't do balanced braces
		# recognition, and just refuses both { and } within \url{}
		# argument for %-detection to work ([^{}%] below). Fix should be
		# possible using
		# https://stackoverflow.com/questions/15301708/perl-regular-expression-match-nested-brackets
		# but is it worth the trouble? (file an issue or send a merge
		# request if you think it is)

		# While there are \url{URL} with unescaped % in URL ...
		my $NON_PERCENT = '([^\\}]%|[^{}%])*';
		while (/^(?<before>.*\\url\{)(?<url>$NON_PERCENT[^\\}]%$NON_PERCENT)(?<after>\}.*)$/) {
			my ($before, $url, $after) = ($+{before}, $+{url}, $+{after});
			# escape unescaped % in URL, if any
			$url =~ s/([^\\])%/$1\\%/g;
			$_ = $before . $url . $after ."\n";
		}
		if (!$empty_comments) {
			# Include \n in pattern to avoid matching
			# comments at end of files

			# remove comments + whitespace-only lines completely
			if (s/^\s*%.*\n//) {
				$$commented_newline = 1;
			}

			# Special-case commands at end of line. We
			# don't want "\\foo%\nbar" to become
			# "\\foobar" (but we still want \@% to result
			# in no space!)
			if (s/^($NON_COMMENT\\([[:alpha:]]|[[:alpha:]@]{2,}))%.*\n/$1 /) {
				$$commented_newline = 1;
			} elsif (s/^($NON_COMMENT)%.*\n/$1/) {
				# remove only the comment if the line has actual content
				$$commented_newline = 1;
			}
		}
		# Apply the "empty comments" treatment unconditionally
		# for comments not matched above (it doesn't harm to
		# keep an empty comment sometimes, but it may harm to
		# leave a real comment if the goal was to strip them).
		s/^(([^\\%]|\\.)*)%.*$/$1%/;
	}

	unless ($keep_includes) {
		# \input{foo.tex}
		my $ARGBRACES = '\{\\s*([^"}\\s][^}]*)(\\s*)\}';
		# \input{"foo bar.tex"}
		my $ARGQUOTED = '\{\\s*"([^"]*)"(\\s*)\}';
		# \input foo.tex
		my $ARGSPACES = '\\s([^\{\\s][^\\s]+?)\\s()';
		my $ARGUMENT = "\\s*?(?|$ARGBRACES|$ARGQUOTED|$ARGSPACES)";

		if (my ($before, $ignored, $full_filename, $trailing, $after)
		    = /^($NON_COMMENT)\\include$ARGUMENT(.*)$/) {
			$full_filename = find_tex_file($full_filename . ".tex");
			if ($full_filename) {
				say $prefix . "Found include for file: $full_filename\n";
				print $before . $nl;
				print '\clearpage{}' . $nl;
				print "% start include $full_filename\n" if ($explain);
				my $in_comment = process_file($full_filename, $prefix . "  ");
				if ($explain) {
				    print " % end include $full_filename\n";
				} elsif ($in_comment) {
				    print "\n";
				}
				print '\clearpage{}' . $nl;
				print $nl . $after . "\n";
				$_ = "";
			}
		} elsif (my ($before, $ignored, $full_filename, $trailing,  $after)
			 = /^($NON_COMMENT)\\input$ARGUMENT(.*)$/) {
                        if ($inside_import) {
                              $full_filename = $inside_import . $full_filename;
                        }
			$full_filename = find_tex_file($full_filename, ":.tex");
			if ($full_filename) {
				say $prefix . "Found input for file: $full_filename\n";
				# Apparently, in some versions of LaTeX, a space
				# after filename in \input{foo.tex } is inserted
				# _before_ the inclusion. That was the case for
                                # me when 31fa806 (deal with space after
                                # filename in \input and \include, 2019-12-11)
                                # was written, but is not anymore, hence we just
                                # throw $trailing away.
				print $before . $nl;
				print "% start input $full_filename\n" if ($explain);
				my $in_comment = process_file($full_filename, $prefix . "  ");
				if ($explain) {
				    print " % end input $full_filename\n";
				} elsif ($in_comment) {
				    print "\n";
				}
				if ($after =~ /[^\s]/) {
				    # LaTeX produces this space, so let's do it also
				    print " " . $nl . $after . "\n";
				} else {
				    print " ";
				}
				$_ = "";
			}
		} elsif (my ($before, $ignored, $dir, $ignored, $full_filename, $ignored,  $after)
			 = /^($NON_COMMENT)\\(?:sub)?import$ARGUMENT$ARGUMENT(.*)$/) {
                        if ($explain) {
                              print "% dir " . $dir ."\n";
                              print "% full_filename " . $full_filename ."\n";
                              print "% after " . $after ."\n";
                              print "% inside_import $inside_import\n";
                        }
                        $full_filename = $dir . $full_filename;
                        if ($inside_import) {
                              $full_filename = $inside_import . $full_filename;
                        }
                        print "% cat(inside_import,dir,full_filename) " . $full_filename ."\n" if ($explain);
			$full_filename = find_tex_file($full_filename, ":.tex");
			if ($full_filename) {
				say $prefix . "Found input for file: $full_filename\n";
				print $before . $nl;
				print "% start input $full_filename\n" if ($explain);
                                my $previous_import_dir = $inside_import;
                                $inside_import = $inside_import . $dir;
				my $in_comment = process_file($full_filename, $prefix . "  ");
                                $inside_import = $previous_import_dir;
				if ($explain) {
				    print " % end input $full_filename\n";
				} elsif ($in_comment) {
				    print "\n";
				}
				if ($after =~ /[^\s]/) {
				    # LaTeX produces this space, so let's do it also
				    print " " . $nl . $after . "\n";
				} else {
				    print " ";
				}
				$_ = "";
			}
		} elsif (my ($before, $ignored, $args, $full_filename, $ignored, $after)
			 = /^($NON_COMMENT)\\includegraphics(\[[^\]]*?\]|)$ARGUMENT(.*)$/) {
                        if ($explain) {
                                print "% inside_import " . $inside_import ."\n";
                                print "% before " . $before ."\n";
                                print "% ignored " . $ignored ."\n";
                                print "% args " . $args ."\n";
                                print "% full_filename " . $full_filename ."\n";
                                print "% after " . $after ."\n";
                        }
                        if ($inside_import) {
                                $full_filename = $inside_import . $full_filename;
                                print "$before\\includegraphics" . "$args" . "{$full_filename}$after\n";
                                $_ = "";
                        }
		} elsif (my ($before, $ignored, $args, $full_filename, $ignored, $after)
			 = /^($NON_COMMENT)\\lstinputlisting(\[[^\]]*?\]|)$ARGUMENT(.*)$/) {
                        if ($explain) {
                                print "% inside_import " . $inside_import ."\n";
                                print "% before " . $before ."\n";
                                print "% ignored " . $ignored ."\n";
                                print "% args " . $args ."\n";
                                print "% full_filename " . $full_filename ."\n";
                                print "% after " . $after ."\n";
                        }
                        if ($inside_import) {
                                $full_filename = $inside_import . $full_filename;
                                print "$before\\lstinputlisting" . "$args" . "{$full_filename}$after\n";
                                $_ = "";
                        }
		}
	}
	if ($expand_usepackage) {
		# Don't bother with before and after text, we just require the
		# usepackage to be alone on its line.
		if (my ($package_name) = /^\s*\\usepackage\{([^\}]*)\}\s*(%.*)?$/) {
			my $full = find_file($package_name . ".sty", $TEXINPUTS);
			if ($full) {
				say $prefix . "Found package file: $full\n";
				process_file($full, $prefix . "  ");
				$_ = "";
				# Forget about any commented newline
				# before the \usepackage:
				$$commented_newline = 0;
			} else {
				say $prefix . "Not including external package $package_name\n";
			}
		}
	}
	if ($expand_bbl) {
		if (my ($before, $bib_name, $after)
			 = /^(.*)\\(?:bibliography|bibselect)\{([^\}]*)\}(.*)$/) {
			# The BBL file is not necessarily $bib_name.
			# Take it from the command-line.
			print $before . $nl;
			say $prefix . "Expanding BBL file: $expand_bbl\n";
			process_file($expand_bbl, $prefix . "  ");
			print " " . $nl . $after . "\n";
			$_ = "";
		}
	}
	if ($biber) {
		if (my ($before, $after)
		    = /^(.*)\\(?:addbibresource)\{[^\}]*\}(.*)$/) {
			# See https://tex.stackexchange.com/questions/166518/biblatex-include-bbl-problem-with-verb-field/166526#166526
			my $biber_noext = $biber;
			$biber_noext =~ s/.bbl//;
			print $before . $nl;
			say $prefix . "Expanding Biber BBL file: $biber\n";
			print '\begin{filecontents*}{' . $biber . '}' . "\n";
			cat_file($biber);
			print "\n";
			print '\end{filecontents*}

\usepackage{xpatch}

%Patch the biblatex input command.
%replace "testinput-bbl" if you change the name above.
%disable if you want to run biblatex/biber normally
\makeatletter
\patchcmd\blx@bblinput{\blx@blxinit}
                      {\blx@blxinit
                       \def\jobname{' . $biber_noext . '}%new jobname
                      }{}{\fail}
\makeatother
			    ';
			say $prefix . "End expansion of Biber BBL file: $biber\n";
			print " " . $nl . $after . "\n";
			$_ = "";
		}
	}
	if ($show_graphics) {
		if (/\\includegraphics(\[[^\]]*\])?{([^}]*)}/) {
                        my $full_filename = $2;
                        if ($inside_import) {
                                $full_filename = $inside_import . $full_filename;
                        }
			my $full = find_tex_file($full_filename, $graphics_extensions);
			say $prefix . "needs graphics file: ";
			print STDERR "$full\n";
		}
	}
	if (/^[ \t]*\\begin\{document\}/) {
		$in_preamble = 0;
		if ($makeatletter) {
			print '\makeatletter' . $nl;
		}
	}
	print;
}

sub unquote
{
	my $str = shift;
	my $x = substr($str, 0, 1);
	my $y = substr($str, -1, 1);
	if ($x eq $y && ($x eq '"' || $x eq "'")) {
		$str = substr($str, 1, -1);
	}
	# There's a weird LaTeX syntax: \include{"file\space
	# with\space spaces"}, so remove these \space when unquoting.
	$str =~ s/\\space / /g;
	return $str;
}

# search $1 in $TEXINPUTS, with possible extensions in $2
sub find_tex_file
{
	my $file = unquote(shift);
	my $extensions = (shift || ":");
	foreach my $ext (split(':', $extensions, -1)) {
		my $full = find_file_global($file . $ext);
		if ($full) {
			return $full;
		}
	}
	if ($fatal) {
		die "ERROR: Could not find file [$file]\n";
	} else {
		print STDERR "Warning: Could not find file [$file]\n";
		return;
	}
}

sub find_file_global
{
	my $file = shift;
	if (open(my $fh, "-|", "kpsewhich", $file)) {
		my $full = <$fh>;
		$full =~ s/\s+$//;
		close($fh);
		if ($full) {
			return $full;
		}
	}
	# Should be useless, but fall-back in case kpsewhich fails (or is not installed, or ...):
	return find_file($file, $TEXINPUTS);
}

# Find files, not searching for global files (to allow not expanding global .sty packages)
sub find_file
{
	my ($file, $path) = @_;
	if (File::Spec->file_name_is_absolute($file)) {
		if (-e "$file" && ! -d "$file") {
			return $file;
		} else {
			return;
		}
	}

	# TEXINPUTS=...: (trailing :) means "append default search
	# directories". We don't want global directories here, but
	# still add . that may be needed.
	if (substr($path, -1) eq ':') {
		$path .= '.';
	}
	foreach my $dir (split(':', $path)) {
		if (-e "$dir/$file" && ! -d "$dir/$file") {
			return("$dir/$file");
		}
	}
	return;
}


__END__

=head1 NAME

latexpand - Flatten LaTeX file by expanding \include and \input, ... and  remove comments

=head1 SYNOPSIS

latexpand [options] FILE...

=head2 Options:

	--verbose        show what's going on
	--keep-comments  don't strip comments (comments are lines
                         starting with %, and anything below
                         \end{document})
	--empty-comments keep empty comments (i.e. % at end of lines) for clarity
	--keep-includes  don't expand \input and \include directives
	--expand-usepackage
	                 Expand \usepackage{...} directives if the
	                 corresponding .sty file is found in
	                 $TEXINPUTS (or the current directory if
	                 $TEXINPUTS is not set)
	--expand-bbl FILE
	                 Expand the bibliography by inlining FILE
	                 (should be a *.bbl file)
	--biber FILE	 Include \bibliography{} with FILE's content,
	                 as needed by biblatex with the biber backend.
	                 (similar to --expand-bbl FILE, but for
	                 biber+biblatex).
	--help           this help message
	--define <key>=<val>, -d <key>=<val>
	                 defines a macro key to be replaced by value, e.g.,
	                 when called with -d foo=bar would replace all occurences
	                 of \foo in the code with bar. Can be supplied multiple times.
	--output <file>, -o <file>
	                 generate output in <file>
	--explain        generate explanatory comments in output
	--show-graphics  show included graphics
	--graphics_extensions
	                 colon-separated list of possible graphics extensions
	                 (used by --show-graphics to find the actual graphics files)
	--fatal          Die in case a file can't be found.
	--makeatletter   Insert a \makeatletter in the preamble. In some
	                 rare cases it may break your document, but it
	                 may help fixing bad interactions between
	                 @-commands and inclusion (see BUGS section).
	--in-encoding FMT, --out-encoding FMT
			 File encoding used by input and output files.
			 This uses the same syntax as PerlIO's layers.
			 Example:
			 --in-encoding 'encoding(UTF-8)'
			 The default is 'bytes' and should always work.

=head1 USES

The most common use of latexpand is to simplify distribution of source
LaTeX files, typically to satisfy the requirement of editors and
archival sites (springer, arXiv.org, ...) who force the authors to
submit sources. One does not necessarily want to submit sources with
comments, and uploading a document made of several files including
each other is a bit painful. By default, latexpand answers both
problems by outputing a single LaTeX file that contain no comment.

=head1 GETTING LATEXPAND

The latest version of latexpand is available here:

  https://gitlab.com/latexpand/latexpand

Versions are uploaded to ctan.org from time to time:

  http://www.ctan.org/pkg/latexpand

=head1 BUGS

Please, report bugs on the issue tracker on the project site:

  https://gitlab.com/latexpand/latexpand/issues

=head2 Known bugs

=head3 Verbatim

latexpand currently ignores \begin{verbatim} ... \end{verbatim}, and
will therefore process any \include, \input, ... directives that
appear within verbatim environments (while it shouldn't).

LaTeX comments inside verbatim environments are also incorrectly
stripped. You can use --keep-comments as a workaround to avoid this.

=head3 Comment environment

It would be nice to remove code between \begin{comment} and
\end{comment} too if \usepackage{comment} is used.

Code like

	foo%
	\begin{comment}

will produce the incorrect

	foo\begin{comment}

A workaround is to use --empty-comments when such tricky usage of the
comments package is done.

=head3 \makeatletter and use with transfig/xfig with \scalebox{}

If \input{} or \include{} appears as argument to a command, and the
file included contains \makeatletter, then after expansion, the
\makeatletter and the @-command appear as argument to the command,
which is forbidden because the argument is parsed (and the @-command
badly tokenized) before being executed.

This happens with

	\scalebox{ \input{file-generated-by-xfig.pdf_t} }

Workaround: add \makeatletter before the scalebox manually in your
code, like

        \makeatletter{}
	\scalebox{ \input{file-generated-by-xfig.pdf_t} }
        \makeatother{}

In the case of xfig generated files, it is necessary only for the
first occurence.

A more brute-force workaround is to use latexpand --makeatletter.

=head1 SEE ALSO

Instructions to include only the relevant .bib items (french):

https://lacl.fr/~caubert/notes/portabilite-du-tex.html#dependances

=head1 VERSION

This is latexpand version @LATEXPAND_VERSION@.
