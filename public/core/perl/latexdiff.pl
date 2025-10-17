#!/usr/bin/env perl
##!/usr/bin/perl -w
# latexdiff - differences two latex files on the word level
#             and produces a latex file with the differences marked up.
#
#   Copyright (C) 2004-22  F J Tilmann (tilmann@gfz-potsdam.de)
#
# Repository/issue tracker:   https://github.com/ftilmann/latexdiff
# CTAN page:          http://www.ctan.org/pkg/latexdiff
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
# Detailed usage information at the end of the file
#
### ToDo (ideas):
###
###  - add possibility to store configuration options for latexdiff in a file rather than as options
###  - use kdiff3 as a merge tool
###  - make style that allows (forward and backjumping with hyperref)
###  - --flatten option only expands first including command per line if there is more than one
###  - move --show-xxx options so that they are also capable of showing preamble (and commands) after all modificationsbased on source file packages
###  - change meaning of --packages option such that this packages are used in addition of automatically detected packages (possibly introduce option --only-packages that overrides automatic choices completely
#
# Note references to issue numbers are for the github repository of latexdiff: https://github.com/ftilmann/latexdiff
#
# Version 1.3.5a: [ bump to 1.4.0 at release!]
#
#  New features:
#  - add directive pairs %BEGIN DIF(ADD|DEL), %END DIF(ADD|DEL) that causes blocks to be marked up as a whole
#  - add directive pair  %BEGIN DIFNOMARKUP, %END DIFNOMARKUP that can suppress markup locally
#  - add option for letter-level markup for single substituted words, controlled by configuration variable MAXCHANGESLETTER, which limits this behaviour to a small number of changes. By default this is set to 1 - other sensible settings are 0 and 2.
#
#  Bug fixes:
#  - Fix a bug in pre-/postprocessing that led to odd behaviour if some characters with special meaning, like _,^ were used in particular contexts in verbatim environments. Fixes #305
#  - Fix a bug in the preprocessing that detects \[ \] as math expression (it was interpreting \\] as \+ \] instead of correctly \\ + ]
#  - Commands that were both in the safecmd and textcmd list, and which have additional arguments beyond the last textual one (optional or non-optional) could lead to errors, if there was a change in those earlier arguments  (fixes #306, first reported through debian bug report)
#  - super- and subscripts without enclosing curly braces were assumed to be a simple expression, while in reality they could be commands with complicated (nested) arguments. These cases are not processed correctly. Fixes #279
#  - in show-textcmd and show-safecmd some extra regex characters are now properly removed
#  - special preamble additions for highlighting graphics or lines in verbatim text no longer overwrite the definitions in a user-included
#    preamble file (vie --preamble option). If the user-included preamble file does not define important commands, then they continue to be added (some simple
#    heuristics are used to decide whether to add or not are used, so this decision might not be perfect). Fixes #310 .
#  - nested array blocks now no longer lead to errors, even when nothing is changed in them (fixes #287).
#  - sometimes, \protect commands would become separated from the commands they are supposed to apply, too. They are now kept together in the same token. Fixes #284
#  - Improper definition of the DIFverbatim environment led to warnings. This has been corrected now. Fixes #320.
#  - In --flatten mode, input commands in verbatim environments were erroneously expanded. This is now suppressed. Fixes #321
#
#  Modified behaviour:
#  - Commands/RegExs explicitly defined as not safe with --exclude-safecmd are now also considered unsafe in COARSE and WHOLE math markup (Fixes #311)
#  - --no-del now also removes deleted comments
#  - --show-...  commands now have different behaviour dependent on whether old.tex and new.tex are specified. If they are not not then the initial setup is shown. If they are specified, then the full configuration is shown, which includes some additions of internal commands, and modifications based on what packages are present on the system, or are used in the .tex files. Either way, no differencing takes place.
#
#
#
# Version 1.3.4:
# New features:
#  - Option to use lua-ul instead of ulem (for use with LuaLaTeX) (fixes #17, #60, #188, #255, #270)
#
# Enhancements:
# - If amsmath is detected as one of the included packages then modify the sout command to wrap with \text in math mode, such that deleted text is actually struck out in equations; the standard behaviour is to underline instead of strike-out due to the limitations in the ulem package  (based on the idea described in PR #263)
#
# Bug fix
#  - sometimes the introduction of aux commands to show deleted lists or descriptions leaves in place empty auxiliary
#    list environments, which would cause error messages (though skipping messages would result in a correct output pdf).
#    These are now removed.
#  - add more mboxsafecmd and safecmd commands for SIunitx to stay compatible with newer versionsof SIunitx (PR #283, fixing issue #282, including reopened #282, contributed by github user joe6302413)
#  - File added via --preamble option is no longer assumed to be ASCII, but read either with encoding as defined by --encoding option or using the encoding of the LOCALE (fixes issue #285 )
#  - multicolumn argument is now treated as text
#  - when tikz-dependency package is used, \& is no longer a safe command as it has special meaning inside dependency environment.  The fix is a bit of a hack as really it should only be considered unsafe within dependency environment (fixes (mostly) issue #303 )
#  - the listings package has trouble with non-ASCII chars. The encoding is now set (thanks to github user anka-213 for finding this). Fixes #304
#
#  Refactor:
#  - Use perltidy for uniform formatting, and removing tab indents
#
# Version 1.3.3:
# New features:
#  - Option --no-del to remove all deleted text (merge contributed by github user tdegeus PR #252, fixing issue #66
#
# Bug fixes:
#  - Abbreviations involving punctuations within them. They need special treatment because otherwise in some
#    circumstances the gnoring of white space differences in conjunction with merging according to MINWORDSBLOCK rule
#    could turn 'i.e.' into 'i.\PAR e.' (see https://github.com/ftilmann/latexdiff/issues/269). A few abbreviations
#    are now hard-coded and treated as atomic:
#    English: i.e., e.g.   Deutsch: z.B.
#    (fixes issue #269)
#  - In WHOLE and COARSE math modes, now properly treat math environments with arguments such as \alignat. Fixes #251
#  - For FINE math mode, multiple improvments to the processing work flow yield more robust outcomes. In particular, changes
#    to the equation type, e.g. \begin{displaymath} -> \begin{equation}  without modifications  now usually no longer result
#    in errors. (Partially) fixes issues #235  and #244.
#  - When encountering deleted math array environments such as align or eqnarray, rather than replacing them with  a
#    fixed replacement environment (e.g. align* or eqnarray*), an asterisk is now added to the original command, which
#    in amsmath (and with eqnarray) will result in the same environment but without line numbers. Config variable MATHARRREPL
#    is therefore (nearly) redundant, and a depracation warning is given when it is set. Reference to MATHARRREPL are have
#    been removed from the manual (there is one exception, when it's still being used: sometimes latexdiff can figure out
#    that there is a deleted array environment, but does not know which one. In this case, MATHARRREPL is still being used
#    to encapsulate these parts of the source, and therefore it is still set internally.  But this is a quite rare situation).
#    Fixes issue #216
#  - Unlike 'array' environment, 'split' (amsmath) does not work in argument of \DIFadd or \DIFdl in UNDERLINE modes; therefore remove it from ARRENV configuration variable.
#     Exclude \begin and \end in math environments in COARSE and WHOLE modes. Fixes #258. Fixes #109
#  - --flatten now works for empty files. Fixes issue #242
#  - improved processing of Chinese and Japanese texts in that splitting is done based on characters. Thanks to LuXu (Oliver Lew) in git for working this out. Fixes #229, fixes #145

# Version 1.3.2
# API adaptions:
#  - latexdiff now completes with exit code 0 after --help or --version command (see issue #248)
# New features / feature extensions
#  - extend CUSTOMDIFCMD related postprocessing to deal properly with multiline commands, or a sequence of several commands in the same line (see github issue #204)
#  - Support for additional macros from import package (\import, \inputfrom, \includefrom, \subimport,\subinputfrom, \subincludefrom). Provided by janniklasrose in PR #243 (fixes #239)
#  - replace default driver dvips->pdftex
# Bug fixes:
#  - fix issue #206 affecting proper markup of text commands which are not also safe cmd's and have multiple arguments
#  - fix issue #210 by adding \eqref (amsmath package) to the list of safe commands
#  - fix bug reported in issue #168 mangled verbatim line environment
#  - fix bug reported in issue #218 by replacing \hspace{0pt} after \mbox{..} auxiliary commands with \hskip0pt.
#  - more ways to process \frac correctly with atomic arguments (committed by julianuu PR #246
#  - fix a bug in biblatex mode, which prevented proper processing of modified \textcite (see: https://tex.stackexchange.com/questions/555157/latexdiff-and-biblatex-citation-commands)
#  - -h string fix: add -driver option
#
# Version 1.3.1.1
#  - remove spurious \n to fix error: Unknown regexp modifier "/n" at .../latexdiff line 1974, near "=~ " (see github issue #201)
#
# Version 1.3.1
#    Bug fixes:
#      - remove some uninitialised variable $2 warnings in string substitution in flatten function in case included file is not found
#      - add minimal postprocessing to diff processing of preamble commands (replace \RIGHTBRACE by \} )
#      - pre-processing: replace (contributed) routine take_comments_and_enter_from_frac() with take_comments_and_newline_from_frac(), which does the same thing
#        (remove whitespace characters and comments between the argument of \frac commands) in an easier and more robust way. In addition, it
#        will replace commands like \frac12 with \frac{1}{2} as pre-processing step.   Fixes issue #184
#      - add "intertext" to list of unsafe math commands @UNSAFEMATHCMD . Fixes issue #179
#      - provide citation command patterns for biblatex and protect them with mbox'es. Fixes issue #199
#      - hardcode number of parameters for \href and \url commands to allow spaces between commands and arguments even if --allow-spaces option is not used (this
#        is needed because some bibliography styles add such in-command-sequence spaces)  Fixes issues: #178 #198
#      - bibitem is now kept even in deleted blocks such that deleted references show up properly (this implies that the actual numbers in numerical referencing schemes will change)
#        (this is implemented by introducing a new class of commands KEEPCMD , which are kept as is in deleted environments (no effect in added environments). Currently
#        \bibitem   is hardwired to be the only member of this class  (fixes issue #194, #174)
#    Features:
#      - add some special processing for revtex bibliography commands, so that the spaces between bibliography commands \bibfield and \bibinfo and their arguments are ignored.
#         (fixes issue #194, should fix #174)
#
# Version 1.3.0 (7 October 2018):
#    - treat options to \documentclass as potential package names (some packages allow implicit loading of or imply selected packages
#    - improved pattern matching: now allows nested angular brackets, and is no longer confused by escaped curly braces
#    - improved pattern matching in COARSE mode: occasionally, the closing bracket or some other elements would be matched in an 'unnatural' way due to another sequence being more minimal in the computational sense, sometimes even causing errors due to tokens moving in or out of the scope of math environments. This is now discouraged by adding internal \DIFANCHOR commands (which are removed again in post-processing) (fixes issues reported via email by li_ruomeng .
#    - verbatim and lstlisting environments are marked-up with line-by-line in a similar style to non-verbatim text (requires the listing package to be installed)
#       (see new configuration variable VERBATIMLINEENV) (several issues and pull requests by jprotze)
#    - --flatten: now supports \verbatiminput and \lstlistinput
#     - --flatten: if file is not found, do not fail, simply warn and leave command unexpanded (inspired by issue #112).  Don't warn if file name contains #[0-9] as it is then most likely an argument within a command definition rather than an actual file (applies to \input, \subfile, \include commands)
#     - added to textcmds: \intertext
#    - new config variable CUSTOMDIFCMD to allow defining special versions of  commands  in added or deleted blocks (Pull request by github user jprotze)
#    - added option -no-links (mostly for use by latexdiff-vc in only-changes modes) (Pull request by github user jprotze)
#    - new option --filter-script to run both input through a pre-processing script (PR jasonmccsmith  #167)
#      new option --no-filter-stderr to hide stderr output from filter-script (potentially dangerous, as this might hide malfunctioning of filter scripts)
#    - --flatten now can deal with imports made using the import package {PR jasonmccsmith #173)
#   Bug fixes:
#    - pattern matching of \verb and \lstinline commands had an error which meant they would trigger on commands beginning with \verb.
#    - In description environments, mark up item descriptions by effectively reating the insides of item commannds as text commands (fixes #161)
#
#
# Version 1.2.1 (22 June 2017)
#    - add "DeclareOldFontCommand" to styles using \bf or \sf old style font commands (fixies issue #92 )
#    - improved markup: process lstinline commands in listings package correctly
#      for styles using colour, \verb and \lstinline arguments are marked up with colour (blue for added, red for deleted)
#    - bug fix: protecting inline math expressions for mbox did not work as intended (see stack exchange question: http://tex.stackexchange.com/questions/359412/compiling-the-latexdiff-when-adding-a-subscript-before-a-pmatrix-environment-cau)
#    - bug fix: when deleted \item commands are followed immediately by unsafe commands, they were not restored properly
#      (thanks to J. Protze for pull request) (pull request #89)
#    - treat lstlisting and comment as equivalent to verbatim environment
#      make environments that are treated like verbatim environments configurable (config variable VERBATIMENV)
#      treat lstinlne as equivalent to verb command
#      partially addresses issue #38
#    - refactoring: set default configuration variables in a hash, and those that correspond to lists
#    - feature: option --add-to-config used to amend configuration variables, which are regex pattern lists
#    - bug fix: deleted figures when endfloat package is activated
#    - bug fix: alignat environment now always processed correctly (fix issues #65)
#    - bug fix: avoid processing of commands as potential files in routine init_regex_arr (fix issue #70 )
#    - minimal feature enhancement: treat '@' as allowed character in commands (strictly speaking requires prior \makeatletter statement, but always assuming it to be
#       @       a letter if it is part of a command name will usually lead to the correct behaviour (see http://tex.stackexchange.com/questions/346651/latexdiff-and-let)
#    - new feature/bug fix: --flatten option \endinput in included files now respected but only if \endinput stands right at the beginning of the line (issue #77)
#    - bug fix: flatten would incorrectly attempt to process commented out \include commands (from discussion in issue #77 )
#    - introduce an invisible space (\hspace{0pt} after \mbox{..} auxiliary commands (not in math mode), to allow line breaks between added and deleted citations (change should not cause adverse behaviour otherwise)
#
# Version 1.2.0:
#    - highlight new and deleted figures
#    - bug fix in title mark-up. Previously deleted commands in title (such as \title, \author or \date) were marked up erroneously
#    - (minor) bug fixes in new 1.1.1 features: disabled label was commented out twice, additional spaces were introduced before list environment begin and end commands
#    - depracation fix: left brace in RegEx now needs to be escaped
#    - add type PDFCOMMENT based on issue #49 submitted by github user peci1 (Martin Pecka)
#    - make utf8 the default encoding
#
# Version 1.1.1
#    - patch mhchem: allow ce in equations
#    - flatten now also expands \input etc. in the preamble (but not \usepackage!)
#    - Better support for Japanese ( contributed by github user kshramt )
#    - prevent duplicated verbatim hashes (patch contributed by github user therussianjig, issue #36)
#    - disable deleted label commands (fixes issue #31)
#    - introduce post-processing to reinstate most deleted environments and all needed item commands (fixes issue #1)
#
# Version 1.1.0
#    - treat diacritics (\",\', etc) as safe commands
#    - treat \_ and \& correctly as safe commands, even if used without spacing to the next word
#    - Add a BOLD markup type that sets added text in bold face (Contribution by Victor Zabalza via pull request )
#    - add append-mboxsafecmd list option to be able to specify special safe commands which need to be surrounded by mbox to avoid breaking (mostly this is needed with ulem package)
#    - support for siunitx and cleveref packages: protect \SI command in siunitx package and \cref,\Cref{range}{*} in cleveref packages (thanks to Stefan Pinnow for testing)
#    - experimental support for chemformula, mhchem packages: define \ch and \ce in packages as safe (but not \ch,\cee in equation array environments) - these unfortunately will not be marked up (thanks to Stefan Pinnow for testing)
#    - bug fix: packages identified correctly even if \usepackage command options extend over several lines (previously \usepackage command needed to be fully contained in one line)
#    - new subtype ONLYCHANGEDPAGE outputs only changed pages (might not work well for floating material)
#    - new subtype ZLABEL operates similarly to LABEL but uses absolute page numbers (needs zref package)
#    - undocumented option --debug/--nodebug to override default setting for debug mode (Default: 0 for release version, 1: for development version
#
# Version 1.0.4
#    - introduce list UNSAFEMATHCMD, which holds list of commands which cannot be marked up with \DIFadd or \DIFdel commands  (only relevant for WHOLE and COARSE math markup modes)
#    - new subtype LABEL which gives each change a label. This can later be used to only display pages where changes
#      have been made (instructions for that are put as comments into the diff'ed file) inspired by answer on http://tex.stackexchange.com/questions/166049/invisible-markers-in-pdfs-using-pdflatex
#    - Configuration variables take into accout some commands from additional packages:
#      tikzpicture environment now treated as PICTUREENV, and \smallmatrix in ARRENV (amsmath)
#    - --flatten: support for \subfile command (subfiles package)  (in response to http://tex.stackexchange.com/questions/167620/latexdiff-with-subfiles )
#    - --flatten: \bibliography commands expand if corresponding bbl file present
#    - angled bracket optional commands now parsed correctly (patch #3570) submitted by Dave Kleinschmidt (thanks)
#    - \RequirePackage now treated as synonym of \usepackage with respect to setting packages
#    - special rules for apacite package (redefine citation commands)
#    - recognise /dev/null as 'file-like' arguments for --preamble and --config options
#    - fix units package incompatibility with ulem for text maths statements $ ..$ (thanks to Stuart Prescott for reporting this)
#    - amsmath environment cases treated correctly (Bug fix #19029) (thanks to Jalar)
#    - {,} in comments no longer confuse latexdiff (Bug fix #19146)
#    - \% in one-letter sub/Superscripts was not converted correctly
#
# Version 1.0.3
#    - fix bug in add_safe_commands that made latexdiff hang on DeclareMathOperator
#      command in preamble
#    - \(..\) inline math expressions were not parsed correctly, if they contained a linebreak
#    - applied patch contributed by tomflannaghan via Berlios: [ Patch #3431 ] Adds correct handling of \left< and \right>
#    - \$ is treated correctly as a literal dollar sign (thanks to Reed Cartwright and Joshua Miller for reporting this bug
#      and sketching out the solution)
#    - \^ and \_ are correctly interpreted as accent and underlined space, respectively, not as superscript of subscript
#      (thanks to Wail Yahyaoui for pointing out this bug)
#
# Version 1.0.1 - treat \big,\bigg etc. equivalently to \left and
#              \right - include starred version in MATHENV - apply
#            - flatten recursively and --flatten expansion is now
#              aware of comments (thanks to Tim Connors for patch)
#            - Change to post-processing for more reliability for
#              deleted math environments
#            - On linux systems, recognise  and remove DOS style newlines
#            - Provide markup for some special preamble commands (\title,
#              \author,\date,
#            - configurable by setting context2cmd
#            - for styles using ulem package, remove \emph and \text.. from list of
#              safe commands in order to allow linebreaks within the
#              highlighted sections.
#            - for ulem style, now show citations by enclosing them in \mbox commands.
#              This unfortunately implies linebreaks within citations no longer function,
#              so this functionality can be turned off (Option --disable-citation-markup).
#              With --enable-citation-markup, the mbox markup is forced for other styles)
#            - new substyle COLOR.  This is particularly useful for marking up citations
#              and some special post-processing is implemented to retain cite
#              commands in deleted blocks.
#            - four different levels of math-markup
#            - Option --driver for choosing driver for modes employing changebar package
#            - accept \\* as valid command (and other commands of form \.*). Also accept
#              \<nl> (backslashed newline)
#            - some typo fixes, include commands defined in preamble as safe commands
#              (Sebastian Gouezel)
#            - include compared filenames as comments as line 2 and 3 of
#              the preamble (can be modified with option --label, and suppressed with
#              --no-label), option --visible-label to show files in generated pdf or dvi
#              at the beginning of main document
#
# Version 0.5  A number of minor improvements based on feedback
#              Deleted blocks are now shown before added blocks
#              Package specific processing
#
# Version 0.43 unreleased typo in list of styles at the end
#              Add protect to all \cbstart, \cbend commands
#              More robust substitution of deleted math commands
#
# Version 0.42 November 06  Bug fixes only
#
# Version 0.4   March 06 option for fast differencing using UNIX diff command, several minor bug fixes (\par bug, improved highlighting of textcmds)
#
# Version 0.3   August 05 improved parsing of displayed math, --allow-spaces
#               option, several minor bug fixes
#
# Version 0.25  October 04 Fix bug with deleted equations, add math mode commands to safecmd, add | to allowed interpunctuation signs
# Version 0.2   September 04 extension to utf-8 and variable encodings
# Version 0.1   August 04    First public release

### NB Lines starting with three hashes should be removed before release
# Inserted block for stand-alone version replaces
# use Algorithm::Diff qw(traverse_sequences);
# in standard version
# The following BEGIN block contains a verbatim copy of
# Ned Konz' Algorithm::Diff package version 1.15 except
# that all POD documentation has been stripped out.
# I encourage you to download and install the Algorithm::Diff
# package and use the standard latexdiff version instead
# (current distribution available from http://search.cpan.org/~nedkonz/Algorithm-Diff-1.15
#  the most recent version can be found via  http://search.cpan.org/search?module=Algorithm::Diff )
# Please note the LICENCE for Algorithm::Diff :
#   "Copyright (c) 2000-2002 Ned Konz.  All rights reserved.
#    This program is free software;
#    you can redistribute it and/or modify it under the same terms
#    as Perl itself."
# The stand-alone version of latexdiff is provided as a convenience
# for latex users with no knowledge of PERL who do not wish to install
# additional packages to be able to use latexdiff.  If you believe
# the inlining of Algorithm::Diff violates its license please contact
# me and I will modify the latexdiff distribution accordingly.
# Frederik Tilmann (tilmann@esc.cam.ac.uk)
BEGIN { 
package Algorithm::Diff;
use strict;
use vars qw($VERSION @EXPORT_OK @ISA @EXPORT);
use integer;    # see below in _replaceNextLargerWith() for mod to make
                # if you don't use this
require Exporter;
@ISA       = qw(Exporter);
@EXPORT    = qw();
@EXPORT_OK = qw(LCS diff traverse_sequences traverse_balanced sdiff);
$VERSION = sprintf('%d.%02d so', (q$Revision: 1.15 $ =~ /\d+/g));

# McIlroy-Hunt diff algorithm
# Adapted from the Smalltalk code of Mario I. Wolczko, <mario@wolczko.com>
# by Ned Konz, perl@bike-nomad.com


# Create a hash that maps each element of $aCollection to the set of positions
# it occupies in $aCollection, restricted to the elements within the range of
# indexes specified by $start and $end.
# The fourth parameter is a subroutine reference that will be called to
# generate a string to use as a key.
# Additional parameters, if any, will be passed to this subroutine.
#
# my $hashRef = _withPositionsOfInInterval( \@array, $start, $end, $keyGen );

sub _withPositionsOfInInterval
{
	my $aCollection = shift;    # array ref
	my $start       = shift;
	my $end         = shift;
	my $keyGen      = shift;
	my %d;
	my $index;
	for ( $index = $start ; $index <= $end ; $index++ )
	{
		my $element = $aCollection->[$index];
		my $key = &$keyGen( $element, @_ );
		if ( exists( $d{$key} ) )
		{
			unshift ( @{ $d{$key} }, $index );
		}
		else
		{
			$d{$key} = [$index];
		}
	}
	return wantarray ? %d : \%d;
}

# Find the place at which aValue would normally be inserted into the array. If
# that place is already occupied by aValue, do nothing, and return undef. If
# the place does not exist (i.e., it is off the end of the array), add it to
# the end, otherwise replace the element at that point with aValue.
# It is assumed that the array's values are numeric.
# This is where the bulk (75%) of the time is spent in this module, so try to
# make it fast!

sub _replaceNextLargerWith
{
	my ( $array, $aValue, $high ) = @_;
	$high ||= $#$array;

	# off the end?
	if ( $high == -1 || $aValue > $array->[-1] )
	{
		push ( @$array, $aValue );
		return $high + 1;
	}

	# binary search for insertion point...
	my $low = 0;
	my $index;
	my $found;
	while ( $low <= $high )
	{
		$index = ( $high + $low ) / 2;

		#		$index = int(( $high + $low ) / 2);		# without 'use integer'
		$found = $array->[$index];

		if ( $aValue == $found )
		{
			return undef;
		}
		elsif ( $aValue > $found )
		{
			$low = $index + 1;
		}
		else
		{
			$high = $index - 1;
		}
	}

	# now insertion point is in $low.
	$array->[$low] = $aValue;    # overwrite next larger
	return $low;
}

# This method computes the longest common subsequence in $a and $b.

# Result is array or ref, whose contents is such that
# 	$a->[ $i ] == $b->[ $result[ $i ] ]
# foreach $i in ( 0 .. $#result ) if $result[ $i ] is defined.

# An additional argument may be passed; this is a hash or key generating
# function that should return a string that uniquely identifies the given
# element.  It should be the case that if the key is the same, the elements
# will compare the same. If this parameter is undef or missing, the key
# will be the element as a string.

# By default, comparisons will use "eq" and elements will be turned into keys
# using the default stringizing operator '""'.

# Additional parameters, if any, will be passed to the key generation routine.

sub _longestCommonSubsequence
{
	my $a      = shift;    # array ref
	my $b      = shift;    # array ref
	my $keyGen = shift;    # code ref
	my $compare;           # code ref

	# set up code refs
	# Note that these are optimized.
	if ( !defined($keyGen) )    # optimize for strings
	{
		$keyGen = sub { $_[0] };
		$compare = sub { my ( $a, $b ) = @_; $a eq $b };
	}
	else
	{
		$compare = sub {
			my $a = shift;
			my $b = shift;
			&$keyGen( $a, @_ ) eq &$keyGen( $b, @_ );
		};
	}

	my ( $aStart, $aFinish, $bStart, $bFinish, $matchVector ) =
	  ( 0, $#$a, 0, $#$b, [] );

	# First we prune off any common elements at the beginning
	while ( $aStart <= $aFinish
		and $bStart <= $bFinish
		and &$compare( $a->[$aStart], $b->[$bStart], @_ ) )
	{
		$matchVector->[ $aStart++ ] = $bStart++;
	}

	# now the end
	while ( $aStart <= $aFinish
		and $bStart <= $bFinish
		and &$compare( $a->[$aFinish], $b->[$bFinish], @_ ) )
	{
		$matchVector->[ $aFinish-- ] = $bFinish--;
	}

	# Now compute the equivalence classes of positions of elements
	my $bMatches =
	  _withPositionsOfInInterval( $b, $bStart, $bFinish, $keyGen, @_ );
	my $thresh = [];
	my $links  = [];

	my ( $i, $ai, $j, $k );
	for ( $i = $aStart ; $i <= $aFinish ; $i++ )
	{
		$ai = &$keyGen( $a->[$i], @_ );
		if ( exists( $bMatches->{$ai} ) )
		{
			$k = 0;
			for $j ( @{ $bMatches->{$ai} } )
			{

				# optimization: most of the time this will be true
				if ( $k and $thresh->[$k] > $j and $thresh->[ $k - 1 ] < $j )
				{
					$thresh->[$k] = $j;
				}
				else
				{
					$k = _replaceNextLargerWith( $thresh, $j, $k );
				}

				# oddly, it's faster to always test this (CPU cache?).
				if ( defined($k) )
				{
					$links->[$k] =
					  [ ( $k ? $links->[ $k - 1 ] : undef ), $i, $j ];
				}
			}
		}
	}

	if (@$thresh)
	{
		for ( my $link = $links->[$#$thresh] ; $link ; $link = $link->[0] )
		{
			$matchVector->[ $link->[1] ] = $link->[2];
		}
	}

	return wantarray ? @$matchVector : $matchVector;
}

sub traverse_sequences
{
	my $a                 = shift;                                  # array ref
	my $b                 = shift;                                  # array ref
	my $callbacks         = shift || {};
	my $keyGen            = shift;
	my $matchCallback     = $callbacks->{'MATCH'} || sub { };
	my $discardACallback  = $callbacks->{'DISCARD_A'} || sub { };
	my $finishedACallback = $callbacks->{'A_FINISHED'};
	my $discardBCallback  = $callbacks->{'DISCARD_B'} || sub { };
	my $finishedBCallback = $callbacks->{'B_FINISHED'};
	my $matchVector = _longestCommonSubsequence( $a, $b, $keyGen, @_ );

	# Process all the lines in @$matchVector
	my $lastA = $#$a;
	my $lastB = $#$b;
	my $bi    = 0;
	my $ai;

	for ( $ai = 0 ; $ai <= $#$matchVector ; $ai++ )
	{
		my $bLine = $matchVector->[$ai];
		if ( defined($bLine) )    # matched
		{
			&$discardBCallback( $ai, $bi++, @_ ) while $bi < $bLine;
			&$matchCallback( $ai,    $bi++, @_ );
		}
		else
		{
			&$discardACallback( $ai, $bi, @_ );
		}
	}

	# The last entry (if any) processed was a match.
	# $ai and $bi point just past the last matching lines in their sequences.

	while ( $ai <= $lastA or $bi <= $lastB )
	{

		# last A?
		if ( $ai == $lastA + 1 and $bi <= $lastB )
		{
			if ( defined($finishedACallback) )
			{
				&$finishedACallback( $lastA, @_ );
				$finishedACallback = undef;
			}
			else
			{
				&$discardBCallback( $ai, $bi++, @_ ) while $bi <= $lastB;
			}
		}

		# last B?
		if ( $bi == $lastB + 1 and $ai <= $lastA )
		{
			if ( defined($finishedBCallback) )
			{
				&$finishedBCallback( $lastB, @_ );
				$finishedBCallback = undef;
			}
			else
			{
				&$discardACallback( $ai++, $bi, @_ ) while $ai <= $lastA;
			}
		}

		&$discardACallback( $ai++, $bi, @_ ) if $ai <= $lastA;
		&$discardBCallback( $ai, $bi++, @_ ) if $bi <= $lastB;
	}

	return 1;
}

sub traverse_balanced
{
	my $a                 = shift;                                  # array ref
	my $b                 = shift;                                  # array ref
	my $callbacks         = shift || {};
	my $keyGen            = shift;
	my $matchCallback     = $callbacks->{'MATCH'} || sub { };
	my $discardACallback  = $callbacks->{'DISCARD_A'} || sub { };
	my $discardBCallback  = $callbacks->{'DISCARD_B'} || sub { };
	my $changeCallback    = $callbacks->{'CHANGE'};
	my $matchVector = _longestCommonSubsequence( $a, $b, $keyGen, @_ );

	# Process all the lines in match vector
	my $lastA = $#$a;
	my $lastB = $#$b;
	my $bi    = 0;
	my $ai    = 0;
	my $ma    = -1;
	my $mb;

	while (1)
	{

		# Find next match indices $ma and $mb
		do { $ma++ } while ( $ma <= $#$matchVector && !defined $matchVector->[$ma] );

		last if $ma > $#$matchVector;    # end of matchVector?
		$mb = $matchVector->[$ma];

		# Proceed with discard a/b or change events until
		# next match
		while ( $ai < $ma || $bi < $mb )
		{

			if ( $ai < $ma && $bi < $mb )
			{

				# Change
				if ( defined $changeCallback )
				{
					&$changeCallback( $ai++, $bi++, @_ );
				}
				else
				{
					&$discardACallback( $ai++, $bi, @_ );
					&$discardBCallback( $ai, $bi++, @_ );
				}
			}
			elsif ( $ai < $ma )
			{
				&$discardACallback( $ai++, $bi, @_ );
			}
			else
			{

				# $bi < $mb
				&$discardBCallback( $ai, $bi++, @_ );
			}
		}

		# Match
		&$matchCallback( $ai++, $bi++, @_ );
	}

	while ( $ai <= $lastA || $bi <= $lastB )
	{
		if ( $ai <= $lastA && $bi <= $lastB )
		{

			# Change
			if ( defined $changeCallback )
			{
				&$changeCallback( $ai++, $bi++, @_ );
			}
			else
			{
				&$discardACallback( $ai++, $bi, @_ );
				&$discardBCallback( $ai, $bi++, @_ );
			}
		}
		elsif ( $ai <= $lastA )
		{
			&$discardACallback( $ai++, $bi, @_ );
		}
		else
		{

			# $bi <= $lastB
			&$discardBCallback( $ai, $bi++, @_ );
		}
	}

	return 1;
}

sub LCS
{
	my $a = shift;                                           # array ref
	my $matchVector = _longestCommonSubsequence( $a, @_ );
	my @retval;
	my $i;
	for ( $i = 0 ; $i <= $#$matchVector ; $i++ )
	{
		if ( defined( $matchVector->[$i] ) )
		{
			push ( @retval, $a->[$i] );
		}
	}
	return wantarray ? @retval : \@retval;
}

sub diff
{
	my $a      = shift;    # array ref
	my $b      = shift;    # array ref
	my $retval = [];
	my $hunk   = [];
	my $discard = sub { push ( @$hunk, [ '-', $_[0], $a->[ $_[0] ] ] ) };
	my $add = sub { push ( @$hunk, [ '+', $_[1], $b->[ $_[1] ] ] ) };
	my $match = sub { push ( @$retval, $hunk ) if scalar(@$hunk); $hunk = [] };
	traverse_sequences( $a, $b,
		{ MATCH => $match, DISCARD_A => $discard, DISCARD_B => $add }, @_ );
	&$match();
	return wantarray ? @$retval : $retval;
}

sub sdiff
{
	my $a      = shift;    # array ref
	my $b      = shift;    # array ref
	my $retval = [];
	my $discard = sub { push ( @$retval, [ '-', $a->[ $_[0] ], "" ] ) };
	my $add = sub { push ( @$retval, [ '+', "", $b->[ $_[1] ] ] ) };
	my $change = sub {
		push ( @$retval, [ 'c', $a->[ $_[0] ], $b->[ $_[1] ] ] );
	};
	my $match = sub {
		push ( @$retval, [ 'u', $a->[ $_[0] ], $b->[ $_[1] ] ] );
	};
	traverse_balanced(
		$a,
		$b,
		{
			MATCH     => $match,
			DISCARD_A => $discard,
			DISCARD_B => $add,
			CHANGE    => $change,
		},
		@_
	);
	return wantarray ? @$retval : $retval;
}

1;
}
import Algorithm::Diff qw(traverse_sequences);
# End of inserted block for stand-alone version


use Getopt::Long;
use strict;
use warnings;
use utf8;

use File::Spec;

my ($algodiffversion) = split( / /, $Algorithm::Diff::VERSION );

my ($versionstring) = <<EOF ;
This is LATEXDIFF 1.3.5a (Algorithm::Diff $Algorithm::Diff::VERSION, Perl $^V)
  (c) 2004-2024 F J Tilmann
EOF

# Hash with defaults for configuration variables. These marked undef have default values constructed from list defined in the DATA block
# (under tag CONFIG)
my %CONFIG = (
  MINWORDSBLOCK => 3,    # minimum number of tokens to form an independent block
                         # shorter identical blocks will be merged to the previous word
  MAXCHANGESLETTER => 1, # maximum number of changes in a letter for letter-level markup 
                         # (rather than standard word level) to be used 
  SCALEDELGRAPHICS => 0.5, # factor with which deleted figures will be scaled down (i.e. 0.5 implies they are shown at half linear size)
                           # this is only used for --dgraphics-markup=BOTH option
  FLOATENV   => undef,            # Environments in which FL variants of defined commands are used
  PICTUREENV => undef,            # Environments in which all change markup is removed
  MATHENV    => undef,            # Environments turning on display math mode (code also knows about \[ and \])
  MATHREPL   => 'displaymath',    # Environment introducing deleted maths blocks
  MATHARRENV => undef,            # Environments turning on eqnarray math mode
  MATHARRREPL => 'eqnarray*', # Environment introducing deleted maths blocks (note that now the starred varieties are being used, so this is only used to replace MATHMODE environments (where original environment is unknown)
  ARRENV => undef, # Environments making arrays in math mode.  The underlining style does not cope well with those - as a result in-text math environments are surrounded by \mbox{ } if any of these commands is used in an inline math block
  COUNTERCMD  => undef,    # COUNTERCMD textcmds which are associated with a counter
                           # If any of these commands occur in a deleted block
                           # they will be followed by an \addtocounter{...}{-1}
                           # for the associated counter such that the overall numbers
                           # should be the same as in the new file
  LISTENV     => undef,    # list making environments - they will generally be kept
  VERBATIMENV => undef,    # Environments whose content should be treated as verbatim text and not be touched
  VERBATIMLINEENV => undef, # Environments whose content should be treated as verbatim text and processed in line diff mode
  CUSTOMDIFCMD => undef, # Custom dif command. Is defined in the document as a \DELcommand and \ADDcommand version to be replaced by the diff
  ITEMCMD => 'item'      # command marking item in a list environment
);
# Configuration variables: these have to be visible from the subroutines
my (
  $ARRENV,     $COUNTERCMD,       $FLOATENV,    $ITEMCMD,         $LISTENV,
  $MATHARRENV, $MATHARRREPL,      $MATHENV,     $MATHREPL,        $MAXCHANGESLETTER, 
  $MINWORDSBLOCK,
  $PICTUREENV, $SCALEDELGRAPHICS, $VERBATIMENV, $VERBATIMLINEENV, $CUSTOMDIFCMD,
);

# my $MINWORDSBLOCK=3; # minimum number of tokens to form an independent block
#                      # shorter identical blocks will be merged to the previous word
# my $SCALEDELGRAPHICS=0.5; # factor with which deleted figures will be scaled down (i.e. 0.5 implies they are shown at half linear size)
#                       # this is only used for --graphics-markup=BOTH option
# my $FLOATENV='(?:figure|table|plate)[\w\d*@]*' ;   # Environments in which FL variants of defined commands are used
# my $PICTUREENV='(?:picture|tikzpicture|DIFnomarkup)[\w\d*@]*' ;   # Environments in which all change markup is removed
# my $MATHENV='(?:equation[*]?|displaymath|DOLLARDOLLAR)[*]?' ;           # Environments turning on display math mode (code also knows about \[ and \])
# my $MATHREPL='displaymath';  # Environment introducing deleted maths blocks
# my $MATHARRENV='(?:eqnarray|align|alignat|gather|multline|flalign)[*]?' ;           # Environments turning on eqnarray math mode
# my $MATHARRREPL='eqnarray*';  # Environment introducing deleted maths blocks
# my $ARRENV='(?:aligned|gathered|multlined|array|[pbvBV]?matrix|smallmatrix|cases|split)'; # Environments making arrays in math mode.  The underlining style does not cope well with those - as a result in-text math environments are surrounded by \mbox{ } if any of these commands is used in an inline math block
# my $COUNTERCMD='(?:footnote|part|chapter|section|subsection|subsubsection|paragraph|subparagraph)';  # textcmds which are associated with a counter
#                                         # If any of these commands occur in a deleted block
#                                         # they will be succeeded by an \addtocounter{...}{-1}
#                                         # for the associated counter such that the overall numbers
#                                         # should be the same as in the new file
# my $LISTENV='(?:itemize|description|enumerate)'; # list making environments - they will generally be kept
# my $ITEMCMD='item';   # command marking item in a list environment

my $LABELCMD = '(?:label)'; # matching commands are disabled within deleted blocks - mostly useful for maths mode, as otherwise it would be fine to just not add those to SAFECMDLIST
my @UNSAFEMATHCMD = ( 'qedhere', 'intertext', 'begin', 'end' ); # Commands which are definitely unsafe for marking up in math mode (amsmath qedhere only tested to not work with UNDERLINE markup) (only affects WHOLE and COARSE math markup modes). Note that unlike text mode (or FINE math mode) deleted unsafe commands are not deleted but simply taken outside \DIFdel
###my $CITECMD=0 ;  # \cite-type commands which need to be protected within an mbox in UNDERLINE and other modes using ulem; pattern simply designed to never match; will be overwritten later for selected styles
###my $CITE2CMD=0;  # \cite-type commands which should be reinstated in deleted blocks
my $MBOXINLINEMATH = 0; # if set to 1 then surround marked-up inline maths expression with \mbox ( to get around compatibility
                        # problems between some maths packages and ulem package

### use context2cmd list instead to define TITLECMD
###my $TITLECMD='(?:title|author|date|institute)'; # Preamble commands which contain text to be epressed by \maketitle command

# Markup strings
# If at all possible, do not change these as parts of the program
# depend on the actual name (particularly post-processing)
# At the very least adapt subroutine postprocess to new tokens.
my $ADDMARKOPEN  = '\DIFaddbegin ';    # Token to mark begin of appended text
my $ADDMARKCLOSE = '\DIFaddend ';      # Token to mark end of appended text
my $ADDOPEN      = '\DIFadd{';         # To mark begin of added text passage
my $ADDCLOSE     = '}';                # To mark end of added text passage
my $ADDCOMMENT   = 'DIF > ';           # To mark added comment line
my $DELMARKOPEN  = '\DIFdelbegin ';    # Token to mark begin of deleted text
my $DELMARKCLOSE = '\DIFdelend ';      # Token to mark end of deleted text
my $DELOPEN      = '\DIFdel{';         # To mark begin of deleted text passage
my $DELCLOSE     = '}';                # To mark end of deleted text passage
my $DELCMDOPEN   = '%DIFDELCMD < ';    # To mark begin of deleted commands (must begin with %, i.e., be a comment
my $DELCMDCLOSE  = "%%%\n";            # To mark end of deleted commands (must end with a new line)
my $AUXCMD       = '%DIFAUXCMD';       #  follows auxiliary commands put in by latexdiff to make difference file legal
                                       # auxiliary commands must be on a line of their own
                                       # Note that for verbatim environment openings the %DIFAUXCMD cannot be placed in
                                       # the same line as this would mean they are shown
                                       # so the special form "%DIFAUXCMD NEXT" is used to indicate that the next line
                                       # is an auxiliary command
     # Similarly "%DIFAUXCMD LAST" would indicate the auxiliary command is in previous line (not currently used)
my $DELCOMMENT  = 'DIF < ';     # To mark deleted comment line
my $VERBCOMMENT = 'DIFVRB ';    # to mark lines which are within a verbatim environment

# main local variables:
my @TEXTCMDLIST     = (); # array containing patterns of commands with text arguments
my @TEXTCMDEXCL     = (); # array containing patterns of commands without text arguments (if a pattern
                          # matches both TEXTCMDLIST and TEXTCMDEXCL it is excluded)
my @CONTEXT1CMDLIST = (); # array containing patterns of commands with text arguments (subset of text commands),
                          # but which cause confusion if used out of context (e.g. \caption).
                          # In deleted passages, the command will be disabled but its argument is marked up
                          # Otherwise they behave exactly like TEXTCMD's
my @CONTEXT1CMDEXCL = (); # exclude list for above, but always empty
my @CONTEXT2CMDLIST = (); # array containing patterns of commands with text arguments, but which fail or cause confusion
                          # if used out of context (e.g. \title). They and their arguments will be disabled in deleted
                          # passages
my @CONTEXT2CMDEXCL = (); # exclude list for above, but always empty
my @MATHTEXTCMDLIST = (); # treat like textcmd.  If a textcmd is in deleted or added block, just wrap the
                          # whole content with \DIFadd or \DIFdel irrespective of content.  This functionality
                          # is useful for pseudo commands \MATHBLOCK.. into which math environments are being
                          # transformed
my @MATHTEXTCMDEXCL = (); #

# Note I need to declare this with "our" instead of "my" because later in the code I have to "local"ise these
our @SAFECMDLIST = (); # array containing patterns of safe commands (which do not break when in the argument of DIFadd or DIFDEL)
our @SAFECMDEXCL = ();
my @MBOXCMDLIST = ();    # patterns for commands which are in principle safe but which need to be surrounded by an \mbox
my @MBOXCMDEXCL = ();    # all the patterns in MBOXCMDLIST will be appended to SAFECMDLIST

my @KEEPCMDLIST = (qr/^bibitem$/); # patterns for commands which should not be deleted in nominally deleted text passages
my @KEEPCMDEXCL = ();

my ( $i, $j, $l );
my ( $old,  $new );
my ( $line, $key );
my (@dumlist);
my ( $newpreamble, $oldpreamble );
my ( @newpreamble, @oldpreamble, @diffpreamble, @diffbody );
my ($latexdiffpreamble);
my ( $oldbody, $newbody, $diffbo );
my ( $oldpost, $newpost );
my ($diffall);
#<<<  format skipping: do not let perltidy change my formatting
# Option names
my ($type,$subtype,$floattype,$config,$preamblefile,$encoding,$nolabel,$visiblelabel,
    $filterscript,$ignorefilterstderr,
    $showpreamble,$showsafe,$showtext,$showconfig,$showall,
    $replacesafe,$appendsafe,$excludesafe,
    $replacetext,$appendtext,$excludetext,
    $replacecontext1,$appendcontext1,
    $replacecontext2,$appendcontext2,
    $help,$verbose,$driver,$version,$ignorewarnings,
    $onlyadditions,
    $enablecitmark,$disablecitmark,$allowspaces,$flatten,$nolinks,$debug,$earlylatexdiffpreamble);  ###$disablemathmark,
#>>>
my ($mboxsafe);
# MNEMNONICS for mathmarkup
my $mathmarkup;
use constant {
  OFF    => 0,
  WHOLE  => 1,
  COARSE => 2,
  FINE   => 3
};
# MNEMNONICS for graphicsmarkup
my $graphicsmarkup;
use constant {
  NONE    => 0,
  NEWONLY => 1,
  BOTH    => 2
};

my ($mboxcmd);
#<<<  format skipping: do not let perltidy change my formatting
my (@configlist,@addtoconfiglist,@labels,
    @appendsafelist,@excludesafelist,
    @appendmboxsafelist,@excludemboxsafelist,
    @appendtextlist,@excludetextlist,
    @appendcontext1list,@appendcontext2list,
    @packagelist);
#>>>
my ( $assign, @config );
# Hash where keys corresponds to the names of  all included packages (including the documentclass as another package
# the optional arguments to the package are the values of the hash elements
my ( $pkg, %packages );

# Global variables for keeping state across subroutines
our $suppress_markup = 0;    # 0: do not block markup, 1: block markup  (supporting DIFNOMARKUP directives)

# Defaults
$mathmarkup    = COARSE;
$verbose       = 0;
$onlyadditions = 0;
# output debug and intermediate files, set to 0 in final distribution
$debug = 0;
# insert preamble directly after documentclass - experimental feature, set to 0 in final distribution
# Note that this failed with mini example (or other files, where packages used in latexdiff preamble
# are called again with incompatible options in preamble of resulting file)
$earlylatexdiffpreamble = 0;

# define character properties
sub IsNonAsciiPunct {
  return <<'END'    # Unicode punctuation but excluding ASCII punctuation
+utf8::IsPunct
-utf8::IsASCII
END
}

sub IsNonAsciiS {
  return <<'END'    # Unicode symbol but excluding ASCII
+utf8::IsS
-utf8::IsASCII
END
}

my %verbhash;

Getopt::Long::Configure('bundling');
GetOptions(
  'type|t=s'                                  => \$type,
  'subtype|s=s'                               => \$subtype,
  'floattype|f=s'                             => \$floattype,
  'config|c=s'                                => \@configlist,
  'add-to-config=s'                           => \@addtoconfiglist,
  'preamble|p=s'                              => \$preamblefile,
  'encoding|e=s'                              => \$encoding,
  'label|L=s'                                 => \@labels,
  'no-label'                                  => \$nolabel,
  'visible-label'                             => \$visiblelabel,
  'exclude-safecmd|A=s'                       => \@excludesafelist,
  'replace-safecmd=s'                         => \$replacesafe,
  'append-safecmd|a=s'                        => \@appendsafelist,
  'exclude-textcmd|X=s'                       => \@excludetextlist,
  'replace-textcmd=s'                         => \$replacetext,
  'append-textcmd|x=s'                        => \@appendtextlist,
  'replace-context1cmd=s'                     => \$replacecontext1,
  'append-context1cmd=s'                      => \@appendcontext1list,
  'replace-context2cmd=s'                     => \$replacecontext2,
  'append-context2cmd=s'                      => \@appendcontext2list,
  'exclude-mboxsafecmd=s'                     => \@excludemboxsafelist,
  'append-mboxsafecmd=s'                      => \@appendmboxsafelist,
  'show-preamble'                             => \$showpreamble,
  'show-safecmd'                              => \$showsafe,
  'show-textcmd'                              => \$showtext,
  'show-config'                               => \$showconfig,
  'show-all'                                  => \$showall,
  'packages=s'                                => \@packagelist,
  'allow-spaces'                              => \$allowspaces,
  'math-markup=s'                             => \$mathmarkup,
  'graphics-markup=s'                         => \$graphicsmarkup,
  'enable-citation-markup|enforce-auto-mbox'  => \$enablecitmark,
  'disable-citation-markup|disable-auto-mbox' => \$disablecitmark,
  'verbose|V'                                 => \$verbose,
  'ignore-warnings'                           => \$ignorewarnings,
  'driver=s'                                  => \$driver,
  'flatten'                                   => \$flatten,
  'filter-script=s'                           => \$filterscript,
  'ignore-filter-stderr'                      => \$ignorefilterstderr,
  'no-links'                                  => \$nolinks,
  'no-del'                                    => \$onlyadditions,
  'version'                                   => \$version,
  'help|h'                                    => \$help,
  'debug!'                                    => \$debug
) or die "Use latexdiff -h to get help.\n";

if ($help) {
  usage();
}

if ($version) {
  print STDERR $versionstring;
  exit 0;
}

print STDERR $versionstring if $verbose;

if ( defined($showall) ) {
  $showpreamble = $showsafe = $showtext = $showconfig = 1;
}
# Default types
$type    = 'UNDERLINE' unless defined($type);
$subtype = 'SAFE'      unless defined($subtype);
# set floattype to IDENTICAL for LABEL and ONLYCHANGEDPAGE subtype, unless it has been set explicitly on the command line
$floattype = ( $subtype eq 'LABEL' || $subtype eq 'ONLYCHANGEDPAGE' ) ? 'IDENTICAL' : 'FLOATSAFE'
  unless defined($floattype);
if ( $subtype eq 'LABEL' ) {
  print STDERR "Note that LABEL subtype is deprecated. If possible, use ZLABEL instead (requires zref package)";
}

if ( defined($mathmarkup) ) {
  $mathmarkup =~ tr/a-z/A-Z/;
  if ( $mathmarkup eq 'OFF' ) {
    $mathmarkup = OFF;
  } elsif ( $mathmarkup eq 'WHOLE' ) {
    $mathmarkup = WHOLE;
  } elsif ( $mathmarkup eq 'COARSE' ) {
    $mathmarkup = COARSE;
  } elsif ( $mathmarkup eq 'FINE' ) {
    $mathmarkup = FINE;
  } elsif ( $mathmarkup !~ m/^[0123]$/ ) {
    die "latexdiff Illegal value: ($mathmarkup)  for option--math-markup. Possible values: OFF,WHOLE,COARSE,FINE,0-3\n";
  }
  # else use numerical value
}

# Give filterscript a default empty string
$filterscript = "" unless defined($filterscript);

# setting extra preamble commands
if ( defined($preamblefile) ) {
  $latexdiffpreamble = join "\n", ( extrapream($preamblefile), "" );
} else {
  $latexdiffpreamble = join "\n", ( extrapream( $type, $subtype, $floattype ), "" );
}

my $preamble_no_comments = $latexdiffpreamble;
$preamble_no_comments =~ s/(?<!\\)%.*$//mg;    # version of preamble stripped of all comments

if ( defined($driver) ) {
  # for changebar only
  $latexdiffpreamble =~ s/\[pdftex\]/[$driver]/sg unless defined($preamblefile);
}
# setting up @SAFECMDLIST and @SAFECMDEXCL
if ( defined($replacesafe) ) {
  init_regex_arr_ext( \@SAFECMDLIST, $replacesafe );
} else {
  init_regex_arr_data( \@SAFECMDLIST, "SAFE COMMANDS" );
}
### if (defined($appendsafe)) {
foreach $appendsafe (@appendsafelist) {
  init_regex_arr_ext( \@SAFECMDLIST, $appendsafe );
}
### }
### if (defined($excludesafe)) {
foreach $excludesafe (@excludesafelist) {
  init_regex_arr_ext( \@SAFECMDEXCL, $excludesafe );
  # add explicit list to unsafe math commands also
  init_regex_arr_ext( \@UNSAFEMATHCMD, $excludesafe );
}
### }
# setting up @MBOXCMDLIST and @MBOXCMDEXCL
### if (defined($mboxsafelist)) {
foreach $mboxsafe (@appendmboxsafelist) {
  init_regex_arr_ext( \@MBOXCMDLIST, $mboxsafe );
}
### }
### if (defined($excludesafe)) {
foreach $mboxsafe (@excludemboxsafelist) {
  init_regex_arr_ext( \@MBOXCMDEXCL, $mboxsafe );
}
### }

# setting up @TEXTCMDLIST and @TEXTCMDEXCL
if ( defined($replacetext) ) {
  init_regex_arr_ext( \@TEXTCMDLIST, $replacetext );
} else {
  init_regex_arr_data( \@TEXTCMDLIST, "TEXT COMMANDS" );
}
### if (defined($appendtext)) {
foreach $appendtext (@appendtextlist) {
  init_regex_arr_ext( \@TEXTCMDLIST, $appendtext );
}
### if (defined($excludetext)) {
foreach $excludetext (@excludetextlist) {
  init_regex_arr_ext( \@TEXTCMDEXCL, $excludetext );
}

# setting up @CONTEXT1CMDLIST ( @CONTEXT1CMDEXCL exist but is always empty )
if ( defined($replacecontext1) ) {
  init_regex_arr_ext( \@CONTEXT1CMDLIST, $replacecontext1 );
} else {
  init_regex_arr_data( \@CONTEXT1CMDLIST, "CONTEXT1 COMMANDS" );
}
foreach $appendcontext1 (@appendcontext1list) {
  init_regex_arr_ext( \@CONTEXT1CMDLIST, $appendcontext1 );
}

# setting up @CONTEXT2CMDLIST ( @CONTEXT2CMDEXCL exist but is always empty )
if ( defined($replacecontext2) ) {
  init_regex_arr_ext( \@CONTEXT2CMDLIST, $replacecontext2 );
} else {
  init_regex_arr_data( \@CONTEXT2CMDLIST, "CONTEXT2 COMMANDS" );
}
foreach $appendcontext2 (@appendcontext2list) {
  init_regex_arr_ext( \@CONTEXT2CMDLIST, $appendcontext2 );
}

# setting configuration variables
### if (defined($config)) {
@config = ();
foreach $config (@configlist) {
  if ( -f $config || lc $config eq '/dev/null' ) {
    open( FILE, $config ) or die("Couldn't open configuration file $config: $!");
    while (<FILE>) {
      chomp;
      next if /^\s*#/ || /^\s*%/ || /^\s*$/;
      push( @config, $_ );
    }
    close(FILE);
  } else {
    #    foreach ( split(",",$config) ) {
    #      push @config,$_;
    #    }
    push @config, split( ",", $config );
  }
}
###  print STDERR "configuration: |$config|  , #@config#\n";
foreach $assign (@config) {
###    print STDERR "assign:|$assign|\n";
  $assign =~ m/\s*(\w*)\s*=\s*(\S*)\s*$/
    or die "Illegal assignment $assign in configuration list (must be variable=value)";
  exists $CONFIG{$1} or die "Unknown configuration variable $1.";
  $CONFIG{$1} = $2;
}

my @addtoconfig = ();
foreach $config (@addtoconfiglist) {
  if ( -f $config || lc $config eq '/dev/null' ) {
    open( FILE, $config ) or die("Couldn't open addd-to-config file $config: $!");
    while (<FILE>) {
      chomp;
      next if /^\s*#/ || /^\s*%/ || /^\s*$/;
      push( @addtoconfig, $_ );
    }
    close(FILE);
  } else {
    #    foreach ( split(",",$config) ) {
    #      push @addtoconfig,$_;
    #    }
    push @addtoconfig, split( ",", $config );
  }
}

# initialise default lists from DATA
# for those configuration variables, which have not been set explicitly, initiate from list in document
foreach $key ( keys(%CONFIG) ) {
  if ( !defined $CONFIG{$key} ) {
    @dumlist = ();
    init_regex_arr_data( \@dumlist, "$key CONFIG" );
    $CONFIG{$key} = join( ";", @dumlist );
  }
}

###  print STDERR "configuration: |$config|  , #@config#\n";
foreach $assign (@addtoconfig) {
  ###print STDERR "assign:|$assign|\n";
  $assign =~ m/\s*(\w*)\s*=\s*(\S*)\s*$/
    or die "Illegal assignment $assign in configuration list (must be variable=value)";
  exists $CONFIG{$1} or die "Unknown configuration variable $1.";
  $CONFIG{$1} .= ";$2";
}

# Map from hash to variables (we do this to have more concise code later, change from comma-separated list)
foreach ( keys(%CONFIG) ) {
  if    ( $_ eq "MINWORDSBLOCK" )    { $MINWORDSBLOCK    = $CONFIG{$_}; }
  elsif ( $_ eq "MAXCHANGESLETTER" ) { $MAXCHANGESLETTER          = $CONFIG{$_}; }
  elsif ( $_ eq "FLOATENV" )         { $FLOATENV         = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "ITEMCMD" )          { $ITEMCMD          = $CONFIG{$_}; }
  elsif ( $_ eq "LISTENV" )          { $LISTENV          = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "PICTUREENV" )       { $PICTUREENV       = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "MATHENV" )          { $MATHENV          = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "MATHREPL" )         { $MATHREPL         = $CONFIG{$_}; }
  elsif ( $_ eq "MATHARRENV" )       { $MATHARRENV       = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "ARRENV" )           { $ARRENV           = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "VERBATIMENV" )      { $VERBATIMENV      = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "VERBATIMLINEENV" )  { $VERBATIMLINEENV  = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "CUSTOMDIFCMD" )     { $CUSTOMDIFCMD     = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "COUNTERCMD" )       { $COUNTERCMD       = liststringtoregex( $CONFIG{$_} ); }
  elsif ( $_ eq "SCALEDELGRAPHICS" ) { $SCALEDELGRAPHICS = $CONFIG{$_}; }
  elsif ( $_ eq "MATHARRREPL" ) {
    $MATHARRREPL = $CONFIG{$_};
    print STDERR
      "WARNING: Setting MATHARRREPL is depracated. Generally deleted math array environments will be set to their starred varieties and the setting of MATHARREPL is ignored.\n\n"
      unless $MATHARRREPL =~ /eqnarray\*/;
  } else {
    die "Unknown configuration variable $_.";
  }
}

if ( $mathmarkup == COARSE || $mathmarkup == WHOLE ) {
  push( @MATHTEXTCMDLIST, qr/^MATHBLOCK(?:$MATHENV|$MATHARRENV|SQUAREBRACKET)$/ );
}

### if ( $disablemathmark ) {
###   $PICTUREENV="(?:$PICTUREENV)|(?:$MATHENV)|(?:$MATHARRENV)|SQUAREBRACKET";
###   $MATHENV="";
###   $MATHARRENV="";
### }

foreach $pkg (@packagelist) {
  map { $packages{$_} = "" } split( /,/, $pkg );
}

if ( $showconfig || $showtext || $showsafe || $showpreamble ) {
  # only quit here if no other argument is given
  # otherwse delay showing the coniguration as it can be modified depending on what is found in the input files
  if ( @ARGV == 0 ) {
    print "%Simple configuration with standard pre-set parameters only:\n";
    print "%   [Provide sample input and output files with the --show... option to get full configuration:]\n";

    show_configuration();
    exit 0;
  }
}

if ( @ARGV != 2 ) {
  print STDERR "2 and only 2 non-option arguments required.  Write latexdiff -h to get help\n";
  exit(2);
}

# Are extra spaces between command arguments permissible?
my $extraspace;
if ($allowspaces) {
  $extraspace = '\s*';
} else {
  $extraspace = '';
}

# append context lists to text lists (as text property is implied)
push @TEXTCMDLIST, qr/^(SUPER|SUB)SCRIPT$/;

push @TEXTCMDLIST, @CONTEXT1CMDLIST;
push @TEXTCMDLIST, @CONTEXT2CMDLIST;

push @TEXTCMDLIST, @MATHTEXTCMDLIST if $mathmarkup == COARSE;

# internal additions to SAFECMDLIST
push( @SAFECMDLIST, qr/^QLEFTBRACE$/, qr/^QRIGHTBRACE$/ );

# Patterns. These are used by some of the subroutines, too
# I can only define them down here because value of extraspace depends on an option
###   my $pat0 = '(?:[^{}]|\\\{|\\\})*';
###  my $pat1 = '(?:[^{}]|\\\{|\\\}|\{'.$pat0.'\})*';
###  my $pat2 = '(?:[^{}]|\\\{|\\\}|\{'.$pat1.'\})*';
###   my $pat3 = '(?:[^{}]|\\\{|\\\}|\{'.$pat2.'\})*';
###   my $pat4 = '(?:[^{}]|\\\{|\\\}|\{'.$pat3.'\})*';
###   my $pat5 = '(?:[^{}]|\\\{|\\\}|\{'.$pat4.'\})*';
###   my $pat6 = '(?:[^{}]|\\\{|\\\}|\{'.$pat5.'\})*';
### 0.6: Use preprocessing to suppress \{ and \}, so no longer need to account for this in patterns
###  my $pat0 = '(?:[^{}])*';
###  my $pat1 = '(?:[^{}]|\{'.$pat0.'\})*';
###  my $pat2 = '(?:[^{}]|\{'.$pat1.'\})*';
###  my $pat3 = '(?:[^{}]|\{'.$pat2.'\})*';
###  my $pat4 = '(?:[^{}]|\{'.$pat3.'\})*';
###  my $pat5 = '(?:[^{}]|\{'.$pat4.'\})*';
###  my $pat6 = '(?:[^{}]|\{'.$pat5.'\})*';

my $pat0  = '(?:[^{}])*';
my $pat_n = $pat0;
# if you get "undefined control sequence MATHBLOCKmath" error, increase the maximum value in this loop
for ( my $i_pat = 0 ; $i_pat < 20 ; ++$i_pat ) {
  $pat_n = '(?:[^{}]|\{' . $pat_n . '\}|\\\\\{|\\\\\})*';
  # Actually within the text body, quoted braces are replaced in pre-processing. The only place where
  # the last part of the pattern matters is when processing the arguments of context2cmds in the preamble
  # and these contain a \{ or \} combination, probably rare.
  # It should thus be fine to use the simpler version below.
  ###  $pat_n = '(?:[^{}]|\{'.$pat_n.'\})*';
}

my $brat0  = '(?:[^\[\]]|\\\[|\\\])*';
my $brat_n = $brat0;
for ( my $i_pat = 0 ; $i_pat < 4 ; ++$i_pat ) {
  $brat_n = '(?:[^\[\]]|\[' . $brat_n . '\]|\\\[|\\\])*';
  ###  $brat_n = '(?:[^\[\]]|\['.$brat_n.'\])*';   # Version not taking into account escaped \[ and \]
}
my $abrat0 = '(?:[^<>])*';

###print STDERR "DEBUG pat1 $pat1\n      pat2 $pat_n\n";
###  my $spacecmd = '\\\\\040';

# variable definitions are in order that they are matched
my $and        = '&';
my $quotemarks = '(?:\'\')|(?:\`\`)';
# some common abbreviations involving punctuations within them. They need special treatment because otherwise in some
# circumstances the gnoring of white space differences in conjunction with merging according to MINWORDSBLOCK rule
# could turn 'i.e.' into 'i.\PAR e.' (see https://github.com/ftilmann/latexdiff/issues/269)
# English: i.e., e.g.   Deutsch: z.B.
my $abbreviation = '(?:i\. ?e\.|e\. ?g\.|z\. ?B\.)';
my $number       = '-?\d*\.\d*';

# word: sequence of letters or accents followed by letter
my $word_cj = '\p{Han}|\p{InHiragana}|\p{InKatakana}';
my $word    = '(?:' . $word_cj . '|(?:(?:[-\w\d*]|\\\\[\"\'\`~^][A-Za-z\*])(?!(?:' . $word_cj . ')))+)';

# quoted underscore - this needs special treatment as perl treats _ as a letter (\w) but latex does not
# such that a\_b would otherwise be interpreted as a{\_}b by latex but a{\_b} by latexdiff
my $quotedunderscore = '\\\\_';
# Handle tex \def macro: \def\MAKRONAME#1[#2]#3{DEFINITION}
my $defseq       = '\\\\def\\\\[\w\d@\*]+(?:#\d+|\[#\d+\])+(?:\{' . $pat_n . '\})?';
my $cmdleftright = '\\\\(?:left|right|[Bb]igg?[lrm]?|middle)\s*(?:[<>()\[\]|\.]|\\\\(?:[|{}]|\w+))';

# for selected commands, the number of arguments is known, and we can therefore allow spaces between command and its argument
# Note that it is still expected that the arguments are blocks marked by parentheses rather than single characters, and that intervening comments will inhibit the association
my $predefinedcmdoptseq12 = '\\\\(?:href|bibfield|bibinfo)\s*(?:\[' . $brat_n . '\])?\s*(?:\{' . $pat_n . '\}\s*){2}'; # Commands with one optional and two non-optional arguments
my $predefinedcmdoptseq01 = '\\\\(?:url|BibitemShut)\s*\s*(?:\{' . $pat_n . '\}\s*){1}'; # Commands with one non-optional argument
  # \bibitem in revtex styles appears to be always followed by \BibItemOpen. We bind \BibItemOpen to the bibitem (if present) in order to prevent the comparison algorithm to interpret the \BibItemOpen as an identical part of the sequence; this interpretation can lead to added and removed entries to the reference list to become mixed.
my $predefinedbibitem =
  '\\\\(?:bibitem)\s*(?:\[' . $brat_n . '\])?\s*(?:\{' . $pat_n . '\})(?:%?\s*\\\\BibitemOpen)?'; # Commands with one optional and one non-optional arguments
my $predefinedcmdoptseq =
  '(?:' . $predefinedcmdoptseq12 . '|' . $predefinedcmdoptseq01 . '|' . $predefinedbibitem . ')';

# standard $cmdoptseq (default: no intrevening spaces, controlled by extraspcae) - a final open parentheses is merged to the commend if it exists to deal properly with multi-argument text command
my $coords = '[\-.,\s\d]*';
#<<<  format skipping: do not let perltidy change my formatting
my $cmdoptseq='(?:\\\\protect)?\\\\[\w\d@\*]+'.$extraspace.
      '(?:(?:<'.$abrat0.'>|\['.$brat_n.'\]|\{'. $pat_n . '\}|\(' . $coords .'\))'.$extraspace.')*\{?';
#>>>

# inline math $....$ or \(..\)
### the commented out version is simpler but for some reason cannot cope with newline (in spite of s option) - need to include \newline explicitly
###  my $math='\$(?:[^$]|\\\$)*?\$|\\\\[(].*?\\\\[)]';
my $math = '\$(?:[^$]|\\\$)*?\$|\\\\[(](?:.|\n)*?\\\\[)]';
### test version (this seems to give the same results as version above)
## the current maths command cannot cope with newline within the math expression
### my $math='\$(?:[^$]|\\\$)*?\$|\\[(].*?\\[)]';
###  my $math='\$(?:[^$]|\\\$)*\$';

my $backslashnl = '\\\\\n';
my $oneletcmd   = '\\\\.\*?(?:\[' . $brat_n . '\]|\{' . $pat_n . '\})*';
my $comment     = '%[^\n]*\n';
my $punct       = '[0.,\/\'\`:;\"\?\(\)\[\]!~\p{IsNonAsciiPunct}\p{IsNonAsciiS}]';
my $mathpunct   = '[+=<>\-\|]';

# Assembled pattern
my $pat =
  qr/(?:\A\s*)?(?:${abbreviation}|${and}|${quotemarks}|${number}|${word}|$quotedunderscore|${defseq}|$cmdleftright|${predefinedcmdoptseq}|${cmdoptseq}|${math}|${backslashnl}|${oneletcmd}|${comment}|${punct}|${mathpunct}|\{|\})\s*/;

# now we are done setting up and can start working
my ( $oldfile, $newfile ) = @ARGV;
# check for existence of input files
if ( !-e $oldfile ) {
  die "Input file $oldfile does not exist";
}
if ( !-e $newfile ) {
  die "Input file $newfile does not exist";
}

# set the labels to be included into the file
# first find out which file name is longer for correct alignment
my ( $diff, $oldlabel_n_spaces, $newlabel_n_spaces );
$oldlabel_n_spaces = 0;
$newlabel_n_spaces = 0;
$diff              = length($newfile) - length($oldfile);
if ( $diff > 0 ) {
  $oldlabel_n_spaces = $diff;
}
if ( $diff < 0 ) {
  $newlabel_n_spaces = abs($diff);
}

my ( $oldtime, $newtime, $oldlabel, $newlabel );
if ( defined( $labels[0] ) ) {
  $oldlabel = $labels[0];
} else {
  $oldtime  = localtime( ( stat($oldfile) )[9] );
  $oldlabel = "$oldfile   " . " " x ($oldlabel_n_spaces) . $oldtime;
}
if ( defined( $labels[1] ) ) {
  $newlabel = $labels[1];
} else {
  $newtime  = localtime( ( stat($newfile) )[9] );
  $newlabel = "$newfile   " . " " x ($newlabel_n_spaces) . $newtime;
}

$encoding = guess_encoding($newfile) unless defined($encoding);

$encoding = "utf8" if $encoding =~ m/^utf8/i;
print STDERR "Encoding $encoding\n" if $verbose;
if ( lc($encoding) eq "utf8" ) {
  binmode( STDOUT, ":utf8" );
  binmode( STDERR, ":utf8" );
}

# filter($text)
# Runs $text through the script provided in $filterscript argument, if set
# If not set, just returns $text unchanged.
# If flatten was set, defer filtering to flatten.  flatten will run the filter
# on all incoming text prior to its own processing.
# If flatten was not set, filter each of old and new once (see just below this def)
sub filter {
  my ($text) = @_;
  my ( $textout, $pid );
  if ( $filterscript ne "" ) {
    print STDERR "Passing " . length($text) . " chars to filter script " . $filterscript . "\n" if $verbose;

    if ($ignorefilterstderr) {
      # If we need to capture and bury STDERR, use the Open3 version, and close CHLD_ERR below.
      use IPC::Open3;
      # We consume STDERR from the process, and hide it
      $pid = open3( \*CHLD_IN, \*CHLD_OUT, \*CHLD_ERR, $filterscript ) or die "open3() failed $!";
    } else {
      # Capture STDOUT and use as our new $text.  Allow STDERR to go to console.
      use IPC::Open2;
      $pid = open2( \*CHLD_OUT, \*CHLD_IN, $filterscript ) or die "open2() failed $!";
    }
    # Send in $text
    print CHLD_IN $text . "\n";    # Adding a newline just to make sure there is one.
    close CHLD_IN;
    # Wait for output and gather it up
    while (<CHLD_OUT>) {
      $textout = $textout . $_;
    }
    if ($ignorefilterstderr) {
      close CHLD_ERR;              # Enable only if Open3 used above
    }
    # On the off chance a very long running and/or frequently called script is used.
    waitpid( $pid, 0 );
    $text = $textout;
    print STDERR "Received " . length($text) . " chars after filtering\n" if $verbose;
    print STDERR $text if $verbose;
  }
  return $text;
}

$old = read_file_with_encoding( $oldfile, $encoding );
$new = read_file_with_encoding( $newfile, $encoding );

if ( not defined($flatten) ) {
  $old = filter($old);
  $new = filter($new);
}

###if (lc($encoding) eq "utf8" ) {
###  binmode(STDOUT, ":utf8");
###  binmode(STDERR, ":utf8");
###  open (OLD, "<:utf8",$oldfile) or die("Couldn't open $oldfile: $!");
###  open (NEW, "<:utf8",$newfile) or die("Couldn't open $newfile: $!");
###  local $/ ; # locally set record operator to undefined, ie. enable whole-file mode
###  $old=<OLD>;
###  $new=<NEW>;
###} elsif ( lc($encoding) eq "ascii") {
###  open (OLD, $oldfile) or die("Couldn't open $oldfile: $!");
###  open (NEW, $newfile) or die("Couldn't open $newfile: $!");
###  local $/ ; # locally set record operator to undefined, ie. enable whole-file mode
###  $old=<OLD>;
###  $new=<NEW>;
###} else {
###  require Encode;
###  open (OLD, "<",$oldfile) or die("Couldn't open $oldfile: $!");
###  open (NEW, "<",$newfile) or die("Couldn't open $newfile: $!");
###  local $/ ; # locally set record operator to undefined, ie. enable whole-file mode
###  $old=<OLD>;
###  $new=<NEW>;
###  print STDERR "Converting from $encoding to utf8\n" if $verbose;
###  $old=Encode::decode($encoding,$old);
###  $new=Encode::decode($encoding,$new);
###}

#### Slurp old and new files
###{
###  local $/ ; # locally set record operator to undefined, ie. enable whole-file mode
###  $old=<OLD>;
###  $new=<NEW>;
###}

# reset time
exetime(1);
### if ( $debug ) {
###     open(RAWDIFF,">","latexdiff.debug.oldfile");
###     print RAWDIFF $old;
###     close(RAWDIFF);
###     open(RAWDIFF,">","latexdiff.debug.newfile");
###     print RAWDIFF $new;
###     close(RAWDIFF);
### }
### print STDERR "DEBUG: before splitting old ",length($old),"\n" if $debug;
( $oldpreamble, $oldbody, $oldpost ) = splitdoc( $old, '\\\\begin\{document\}', '\\\\end\{document\}' );

###if ( $oldpreamble =~ m/\\usepackage\[(\w*?)\]\{inputenc\}/  ) {
###    $encoding=$1;
###    require Encode;
###    print STDERR "Detected input encoding $encoding.\n" if $verbose;
###    $oldpreamble=Encode::decode($encoding,$oldpreamble);
###    $oldbody=Encode::decode($encoding,$oldbody);
###    $oldpost=Encode::decode($encoding,$oldpost);
####    Encode::from_to($oldpreamble,$encoding,"utf8");
####    Encode::from_to($oldbody,$encoding,"utf8");
####    Encode::from_to($oldpost,$encoding,"utf8");
###  }
###print STDERR "DEBUG: before splitting new ",length($old),"\n" if $debug;
( $newpreamble, $newbody, $newpost ) = splitdoc( $new, '\\\\begin\{document\}', '\\\\end\{document\}' );

###if ( $newpreamble =~ m/\\usepackage\[(\w*?)\]\{inputenc\}/  ) {
##  if ($encoding ne $1 ) {
###    die  "Input encoding in both old and new file must be the same.\n";
###  }
###  $newpreamble=Encode::decode($encoding,$newpreamble);
###  $newbody=Encode::decode($encoding,$newbody);
###  $newpost=Encode::decode($encoding,$newpost);
###  #    Encode::from_to($newpreamble,$encoding,"utf8");
###  #    Encode::from_to($newbody,$encoding,"utf8");
###  #    Encode::from_to($newpost,$encoding,"utf8");
###}

if ($flatten) {
  $oldbody = flatten( $oldbody, $oldpreamble, File::Spec->rel2abs($oldfile), $encoding );
  $newbody = flatten( $newbody, $newpreamble, File::Spec->rel2abs($newfile), $encoding );
  # flatten preamble
  $oldpreamble = flatten( $oldpreamble, $oldpreamble, File::Spec->rel2abs($oldfile), $encoding );
  $newpreamble = flatten( $newpreamble, $newpreamble, File::Spec->rel2abs($newfile), $encoding );

###   if ( $debug ) {
###     open(FILE,">","latexdiff.debug.flatold");
###     print FILE $oldpreamble,'\\begin{document}',$oldbody,'\\end{document}',$oldpost;
###     close(FILE);
###     open(FILE,">","latexdiff.debug.flatnew");
###     print FILE $newpreamble,'\\begin{document}',$newbody,'\\end{document}',$newpost;
###     close(FILE);
###   }
}

my @auxlines;

# boolean variab
my ($ulem) = 0;

if ( length $oldpreamble && length $newpreamble ) {
  # pre-process preamble by looking for commands used in \maketitle (title, author, date etc commands)
  # and marking up content with latexdiff markup
  @auxlines = preprocess_preamble( $oldpreamble, $newpreamble );

  @oldpreamble = split /\n/, $oldpreamble;
  @newpreamble = split /\n/, $newpreamble;

  # If a command is defined in the preamble of the new file, and only uses safe commands, then it can be considered to be safe) (contribution S. Gouezel)
  # Base this assessment on the new preamble
  add_safe_commands($newpreamble);

  # get a list of packages from preamble if not predefined
###  %packages=list_packages(@newpreamble) unless %packages;
  %packages = list_packages($newpreamble) unless %packages;
  if ( %packages && $debug ) {
    my $key;
    foreach $key ( keys %packages ) { print STDERR "DEBUG \\usepackage[", $packages{$key}, "]{", $key, "}\n"; }
  }
}

# have to return to all processing to properly add preamble additions based on packages found
if ( defined($graphicsmarkup) ) {
  $graphicsmarkup =~ tr/a-z/A-Z/;
  if ( $graphicsmarkup eq 'OFF' or $graphicsmarkup eq 'NONE' ) {
    $graphicsmarkup = NONE;
  } elsif ( $graphicsmarkup eq 'NEWONLY' or $graphicsmarkup eq 'NEW-ONLY' ) {
    $graphicsmarkup = NEWONLY;
  } elsif ( $graphicsmarkup eq 'BOTH' ) {
    $graphicsmarkup = BOTH;
  } elsif ( $graphicsmarkup !~ m/^[012]$/ ) {
    die
      "latexdiff Illegal value: ($graphicsmarkup)  for option --highlight-graphics. Possible values: OFF,WHOLE,COARSE,FINE,0-2\n";
  }
  # else use numerical value
} else {
  # Default: no explicit setting in menu
  if ( defined $packages{"graphicx"} or defined $packages{"graphics"} ) {
    $graphicsmarkup = NEWONLY;
  } else {
    $graphicsmarkup = NONE;
  }
}

if ( defined $packages{"hyperref"} ) {
  # deleted lines should not generate or appear in link names:
  print STDERR "hyperref package detected.\n" if $verbose;
  $latexdiffpreamble =~ s/\{\\DIFadd\}/{\\DIFaddtex}/g;
  $latexdiffpreamble =~ s/\{\\DIFdel\}/{\\DIFdeltex}/g;
  $latexdiffpreamble .= join "\n", ( extrapream("HYPERREF"), "" );
  if ($nolinks) {
    $latexdiffpreamble .= "\n\\hypersetup{bookmarks=false}";
  }
  ###    $latexdiffpreamble .= '%DIF PREAMBLE EXTENSION ADDED BY LATEXDIFF FOR HYPERREF PACKAGE' . "\n";
  ###    $latexdiffpreamble .= '\providecommand{\DIFadd}[1]{\texorpdfstring{\DIFaddtex{#1}}{#1}}' . "\n";
  ###    $latexdiffpreamble .= '\providecommand{\DIFdel}[1]{\texorpdfstring{\DIFdeltex{#1}}{}}' . "\n";
  ###    $latexdiffpreamble .= '%DIF END PREAMBLE EXTENSION ADDED BY LATEXDIFF FOR HYPERREF PACKAGE' . "\n";
}

# add commands for figure highlighting to preamble
if ( $graphicsmarkup != NONE ) {
  my @matches;
  # Check if \DIFaddbeginFL definition calls \DIFaddbegin - if so we will issue an error message that graphics highlighting is
  # is not compatible with this.
  # (A more elegant solution would be to suppress the redefinitions of the \DIFaddbeginFL etc commands, but for this narrow use case
  #  I currently don't see this as an efficient use of time)
  ### The foreach loop does not make sense here. I don't know why I put this in -  (F Tilmann)
  ###foreach my $cmd ( "DIFaddbegin","DIFaddend","DIFdelbegin","DIFdelend" ) {
  @matches = ( $latexdiffpreamble =~ m/command\{\\DIFaddbeginFL}\{($pat_n)}/sg );
  # we look at the last one of the list to take into account possible redefinition but almost always matches should have exactly one element
  if ( $matches[$#matches] =~ m/\\DIFaddbegin/ ) {
    die
      "Cannot combine graphics markup with float styles defining \\DIFaddbeginFL in terms of \\DIFaddbegin. Use --graphics-markup=none option or choose a different float style.";
    exit 10;
  }
  ###}
  $latexdiffpreamble .= join "\n",
    ( "\\providecommand{\\DIFscaledelfig}{$SCALEDELGRAPHICS}", extrapream("HIGHLIGHTGRAPHICS"), "" )
    #      unless $preamble_no_comments =~ m/\{\\DIFdelgraphicsbox\}/ ;
    unless $preamble_no_comments =~ m/\{\\(?:DIFdelgraphicsbox|DIFdelgraphicswidth|DIFdelgraphicsheight)\}/;

  # only change required for highlighting both is to declare \includegraphics safe, as preamble already contains commands for deleted environment
  if ( $graphicsmarkup == BOTH ) {
    init_regex_arr_list( \@SAFECMDLIST, 'includegraphics' );
  }
}

$ulem = ( $latexdiffpreamble =~ /\\RequirePackage(?:\[$brat_n\])?\{ulem\}/ || defined $packages{"ulem"} );

# If amsmath is defined and $ulem is used for markup, redefine the \sout command to also work (mostly) in math mode
# See stack exchange https://tex.stackexchange.com/questions/20609/strikeout-in-math-mode/308647#308647 based on comment by Taylor Raine
if ( defined( $packages{'amsmath'} ) and $ulem ) {
  $latexdiffpreamble .= join "\n", ( extrapream('AMSMATHULEM'), "" );
}

# If listings is being used or can be found in the latexdiff search path, add to the preamble auxiliary code to enable line-by-line markup
if ( defined( $packages{"listings"} ) or `kpsewhich listings.sty` ne "" ) {
  my @listingpreamble = extrapream("LISTINGS");
  if ( $latexdiffpreamble =~ /\\RequirePackage(?:\[$brat_n\])?\{color\}/ ) {
    @listingpreamble = extrapream("COLORLISTINGS");
  }
  my @listingDIFcode = ();
  my $replaced;
  # note that in case user supplies preamblefile the type might not reflect well the actual markup style
  @listingDIFcode = extrapream( "-nofail", "DIFCODE_" . $type ) unless defined($preamblefile);
  if ( !(@listingDIFcode) ) {
    # if listingDIFcode is empty try to guess a suitable one from the preamble
    if ( $latexdiffpreamble =~ /\\RequirePackage(?:\[$brat_n\])?\{color\}/ and $ulem ) {
      @listingDIFcode = extrapream("DIFCODE_UNDERLINE");
    } elsif ( $latexdiffpreamble =~ /\\RequirePackage(?:\[$brat_n\])?\{color\}/ ) {
      # only colour used
      @listingDIFcode = extrapream("DIFCODE_CFONT");
    } else {
      # fall-back solution
      @listingDIFcode = extrapream("DIFCODE_BOLD");
    }
  }
  # add configuration so that listings work with utf-8
  push @listingpreamble, '\lstset{extendedchars=\true,inputencoding=' . $encoding . "}\n";

  # now splice it in
  $replaced = 0;
  ###print STDERR "DEBUG: listingDIFcode: ",join("\n",@listingDIFcode),"|||\n" if $debug;

  @listingpreamble = grep {
    # only replace if this has not been done already (use short-circuit property of and)
    if ( !$replaced and $_ =~ s/^.*%DIFCODE TEMPLATE.*$/join("\n",@listingDIFcode)/e ) {
      ###print STDERR "DEBUG: Replaced text $_\n" if $debug;
      $replaced = 1;
      1;
    } else {
      # return false for those lines matching %DIFCODE TEMPLATE (so that they are not included in output)
      not m/%DIFCODE TEMPLATE/;
    }
  } @listingpreamble;
  ###  print STDERR "DEBUG: listingpreamble @listingpreamble\n";
  $latexdiffpreamble .= join "\n", ( @listingpreamble, "" )
    unless $preamble_no_comments =~ m/\\lstnewenvironment\{DIFverbatim\}/;
} else {
  print STDERR "WARNING: listings package not detected. Disabling mark-up in verbatim environments \n";
  # if listings does not exist disable line-by-line markup and treat all verbatim environments as opaque
  $VERBATIMENV     = liststringtoregex( $CONFIG{VERBATIMENV} . ";" . $CONFIG{VERBATIMLINEENV} );
  $VERBATIMLINEENV = "";
}

if ( $showconfig || $showtext || $showsafe || $showpreamble ) {
  # only quit here if no other argument is given
  # otherwse delay showing the coniguration as it can be modified depending on what is found in the input files
  print "%Full configuration after parsing input files and adding internal commands:\n";
  show_configuration();
  exit(0);
}

# adding begin and end marker lines to preamble
$latexdiffpreamble =
    "%DIF PREAMBLE EXTENSION ADDED BY LATEXDIFF\n"
  . $latexdiffpreamble
  . "%DIF END PREAMBLE EXTENSION ADDED BY LATEXDIFF\n";

# and return to preamble specific processing
if ( length $oldpreamble && length $newpreamble ) {
  print STDERR "Differencing preamble.\n" if $verbose;

  # insert dummy first line such that line count begins with line 1 (rather than perl's line 0) - just so that line numbers inserted by linediff are correct
  unshift @newpreamble, '';
  unshift @oldpreamble, '';
  @diffpreamble = linediff( \@oldpreamble, \@newpreamble );
  # remove dummy line again
  shift @diffpreamble;
  # add filenames, modification time and latexdiff mark
  defined($nolabel)
    or splice @diffpreamble, 1, 0,
    "%DIF LATEXDIFF DIFFERENCE FILE",
    , "%DIF DEL $oldlabel",
    "%DIF ADD $newlabel";
  if (@auxlines) {
    push @diffpreamble, "%DIF DELETED TITLE COMMANDS FOR MARKUP";
    push @diffpreamble, join( "\n", @auxlines );
  }
  if ($earlylatexdiffpreamble) {
    # insert latexdiff command directly after documentclass at beginning of preamble
    # note that grep is only run for its side effect
    ( grep { s/^([^%]*\\documentclass.*)$/$1$latexdiffpreamble/ } @diffpreamble ) == 1
      or die "Could not find documentclass statement in preamble";
  } else {
    # insert latexdiff commands at the end of preamble (default behaviour)
    push @diffpreamble, $latexdiffpreamble;
  }
  push @diffpreamble, '\begin{document}';
  if ( defined $packages{"hyperref"} && $nolinks ) {
    push @diffpreamble, '\begin{NoHyper}';
  }
} elsif ( !length $oldpreamble && !length $newpreamble ) {
  @diffpreamble = ();
} else {
  print STDERR "Either both texts must have preamble or neither text must have the preamble.\n";
  exit(2);
}
### Output preamble: DEBUG
###foreach $line ( @diffpreamble ) {
###  print "$line\n";
###}

# Special: treat all cite commands as safe except in UNDERLINE and FONTSTRIKE mode
# (there is a conflict between citation and ulem package, see
# package documentation)
# Use post-processing
### Don't do what is stated below as in short deleted sequences one would actually like it as a safecmd
### Also long arguments of \text.. commands are not line-wrapped when underlined (see documentation of ulem.sty
### for why; essentially, ulem treats secondary braces as blocks which it cannot break).
### For this reason we only declare them as safe in the other styles.
### Because they are text commands their content is still marked up
# and $packages{"apacite"}!~/natbibpapa/
###my ($citpat,$citpatsafe);

###  if (defined $packages{"units"} && ( uc($type) eq "UNDERLINE" || uc($type) eq "FONTSTRIKE" || uc($type) eq "CULINECHBAR") {
if ( defined $packages{"units"} && $ulem ) {
  # protect inlined maths environments by surrounding with an \mbox
  # this is done to get around an incompatibility between the ulem and units package
  # where spaces in the argument to underlined or crossed-out \unit commands cause an error message
  print STDERR "units package detected at the same time as style using ulem.\n" if $verbose;
  $MBOXINLINEMATH = 1;
}

if ( defined $packages{"siunitx"} ) {
  # protect SI command by surrounding them with an \mbox
  # this is done to get around an incompatibility between the ulem and siunitx package
  print STDERR "siunitx package detected.\n" if $verbose;
  my $mboxcmds = 'SI,ang,numlist,numrange,SIlist,SIrange,qty,qtylist,qtyproduct,qtyrange,complexqty,num';
  init_regex_arr_list( \@SAFECMDLIST, 'num,si,numproduct,unit,complexnum' );
  if ( $enablecitmark || ( $ulem && !$disablecitmark ) ) {
    init_regex_arr_list( \@MBOXCMDLIST, $mboxcmds );
  } else {
    init_regex_arr_list( \@SAFECMDLIST, $mboxcmds );
  }
}

if ( defined $packages{"cleveref"} ) {
  # protect selected command by surrounding them with an \mbox
  # this is done to get around an incompatibility between ulem and cleveref package
  print STDERR "cleveref package detected.\n" if $verbose;
  my $mboxcmds = '[Cc]ref(?:range)?\*?,labelcref,(?:lc)?name[cC]refs?';
  if ( $enablecitmark || ( $ulem && !$disablecitmark ) ) {
    init_regex_arr_list( \@MBOXCMDLIST, $mboxcmds );
  } else {
    init_regex_arr_list( \@SAFECMDLIST, $mboxcmds );
  }
}

if ( defined $packages{"glossaries"} ) {
  # protect selected command by surrounding them with an \mbox
  # this is done to get around an incompatibility between ulem and glossaries package
  print STDERR "glossaries package detected.\n" if $verbose;
  my $mboxcmds =
    '[gG][lL][sS](?:|pl|disp|link|first|firstplural|desc|user[iv][iv]?[iv]?),[aA][cC][rR](?:long|longpl|full|fullpl),[aA][cC][lfp]?[lfp]?';
  init_regex_arr_list( \@SAFECMDLIST,
    '[gG][lL][sS](?:(?:entry)?(?:text|plural|name|symbol)|displaynumberlist|entryfirst|entryfirstplural|entrydesc|entrydescplural|entrysymbolplural|entryuser[iv][iv]?[iv]?|entrynumberlist|entrydisplaynumberlist|entrylong|entrylongpl|entryshort|entryshortpl|entryfull|entryfullpl),[gG]lossentry(?:name|desc|symbol),[aA][cC][rR](?:short|shortpl),[aA]csp?'
  );
  if ( $enablecitmark || ( $ulem && !$disablecitmark ) ) {
    init_regex_arr_list( \@MBOXCMDLIST, $mboxcmds );
  } else {
    init_regex_arr_list( \@SAFECMDLIST, $mboxcmds );
  }
}

if ( defined $packages{"chemformula"} or defined $packages{"chemmacros"} ) {
  print STDERR "chemformula package detected.\n" if $verbose;
  init_regex_arr_list( \@SAFECMDLIST, 'ch' );
  push( @UNSAFEMATHCMD, 'ch' );
  # The next command would be needed to allow highlighting the interior of \ch commands in math environments
  # but the redefinitions in chemformula are too deep to make this viable
  # push(@MATHTEXTCMDLIST,'ch');
}

if ( defined $packages{"mhchem"} ) {
  print STDERR "mhchem package detected.\n" if $verbose;
  init_regex_arr_list( \@SAFECMDLIST, 'ce' );
  push( @UNSAFEMATHCMD, 'ce', 'cee' );
  # The next command would be needed to allow highlighting the interior of \cee commands in math environments
  # but the redefinitions in chemformula are too deep to make this viable
  # push(@MATHTEXTCMDLIST,'cee');
}

if ( defined $packages{"tikz-dependency"} ) {
  init_regex_arr_ext( \@SAFECMDEXCL, 'AMPERSAND' );
}

my ($citpat);

if ( defined $packages{"apacite"} ) {
  print STDERR "apacite package detected.\n" if $verbose;
###  $citpatsafe=qr/^(?:mask)?(?:full|short)?cite(?:A|author|year)?(?:NP)?$/;
  $citpat = '(?:mask)?(?:full|short|no)?cite(?:A|author|year|meta)?(?:NP)?';
} elsif ( defined $packages{"biblatex"} ) {
  print STDERR "biblatex package detected.\n" if $verbose;
  $citpat = '(?:[cC]ites?|(?:[pP]aren|foot|[Tt]ext|[sS]mart|super)cites?\*?|footnotecitetex)';
  push( @TEXTCMDEXCL, qr/^textcite$/ );
} else {
  # citation command pattern for all other citation schemes
###  $citpatsafe=qr/^cite.*$/;
  $citpat = '(?:cite\w*|nocite)';
}

###if ( uc($type) ne "UNDERLINE" && uc($type) ne "FONTSTRIKE" && uc($type) ne "CULINECHBAR" ) {
###  push (@SAFECMDLIST, qr/^cite.*$/);
if ( !$ulem ) {
  # modes not using ulem: citation is safe
  push( @SAFECMDLIST, $citpat );
} else {
  ### Experimental: disable text and emph commands
###  push (@SAFECMDLIST, qr/^cite.*$/) unless $disablecitmark;
  push( @SAFECMDEXCL, qr/^emph$/, qr/^text..$/ );
  # replace \cite{..} by \mbox{\cite{..}} in added or deleted blocks in post-processing
###  push (@SAFECMDLIST, $citpatsafe) unless $disablecitmark;
  push( @MBOXCMDLIST, $citpat ) unless $disablecitmark;
  if ( uc($subtype) eq "COLOR" or uc($subtype) eq "DVIPSCOL" ) {
    # remove \cite command again from list of safe commands
    pop @MBOXCMDLIST;
    # deleted cite commands
###    $CITE2CMD='(?:cite\w*|nocite)' unless $disablecitmark ; # \cite-type commands which should be reinstated in deleted blocks
###    $CITE2CMD=$citpat unless $disablecitmark ; # \cite-type commands which should be reinstated in deleted blocks
  }
### else {
###    $CITECMD=$citpat unless $disablecitmark ; # \cite commands which need to be protected within an mbox in UNDERLINE and other modes using ulem
###  }
}
###$CITECMD=$citpat if $enablecitmark ; # as above for explicit selection
push( @MBOXCMDLIST, $citpat ) if $enablecitmark;

###print STDERR "CITECMD:|$CITECMD|\n" if $debug;

if ( defined $packages{"amsmath"} or defined $packages{"amsart"} or defined $packages{"amsbook"} ) {
  print STDERR "amsmath package detected.\n" if $verbose;
  $MATHARRREPL = 'align*';
}

# add commands in MBOXCMDLIST to SAFECMDLIST
foreach $mboxcmd (@MBOXCMDLIST) {
  init_regex_arr_list( \@SAFECMDLIST, $mboxcmd );
}

# check if \label is in SAFECMDLIST, and if yes replace "label" in $LABELCMD by something that never matches (we hope!)
if ( iscmd( "label", \@SAFECMDLIST, \@SAFECMDEXCL ) ) {
  $LABELCMD =~ s/label/NEVERMATCHLABEL/;
}

print STDERR "Preprocessing body.  " if $verbose;
###my ($oldleadin,$newleadin)=preprocess($oldbody,$newbody);
preprocess( $oldbody, $newbody );
writedebugfile( $oldbody, 'old-preprocess' );
writedebugfile( $newbody, 'new-preprocess' );

# run difference algorithm
@diffbody = bodydiff( $oldbody, $newbody );
$diffbo   = join( "", @diffbody );
writedebugfile( $diffbo, "bodydiff" );

print STDERR "(", exetime(), " s)\n", "Postprocessing body. \n" if $verbose;
postprocess($diffbo);
####print "POSTPROCESS NEW:\n$newbody\n";
$diffall = join( "\n", @diffpreamble );
# add visible labels
if ( defined($visiblelabel) ) {
  # Give information right after \begin{document} (or at the beginning of the text for files without preamble
  ### if \date command is used, add information to \date argument, otherwise give right after \begin{document}
  ###  $diffall=~s/(\\date$extraspace(?:\[$brat0\])?$extraspace)\{($pat_n)\}/$1\{$2 \\ LATEXDIFF comparison \\ Old: $oldlabel \\ New: $newlabel \}/  or
  $diffbo = "\\begin{verbatim}LATEXDIFF comparison\nOld: $oldlabel\nNew: $newlabel\\end{verbatim}\n$diffbo";
}

###$diffall .= "$newleadin$diffbo" ;
$diffall .= "$diffbo";
if ( defined $packages{"hyperref"} && $nolinks ) {
  $diffall .= "\\end{NoHyper}\n";
}
$diffall .= "\\end{document}$newpost" if length $newpreamble;
if ( lc($encoding) ne "utf8" && lc($encoding) ne "ascii" ) {
  print STDERR "Encoding output file to $encoding\n" if $verbose;
  $diffall = Encode::encode( $encoding, $diffall );
  binmode STDOUT;
}
print $diffall;

###print join("\n",@diffpreamble);
###print "$newleadin$diffbo";
###print "\\end{document}$newpost" if length $newpreamble ;

print STDERR "(", exetime(), " s)\n", "Done.\n" if $verbose;
### End of main

### Subroutines
# liststringtoregex(liststring)
# expands string with semi-colon separated list into a regular expression corresponding
# matching any of the elements
sub liststringtoregex {
  my ($liststring) = @_;
  my @elements = grep /\S/, split( ";", $liststring );
  if (@elements) {
    return ( '(?:(?:' . join( ')|(?:', @elements ) . '))' );
  } else {
    return "";
  }
}

# show_configuration
# note that this is not encapsulated but uses variables from the main program
# It is provided for convenience because in the future it is planned to allow output
# to be modified based on what packages are read etc - this works only if the input files are actually read
# whether or not additional files are provided
sub show_configuration {
  if ($showpreamble) {
    print "\n%Preamble commands:\n";
    print $latexdiffpreamble ;
  }

  if ($showsafe) {
    print "\nsafecmd: Commands safe within scope of $ADDOPEN $ADDCLOSE and $DELOPEN $DELCLOSE (unless excluded):\n";
    print_regex_arr(@SAFECMDLIST);
    print "\nsafecmd-exclude: Commands not safe within scope of $ADDOPEN $ADDCLOSE and $DELOPEN $DELCLOSE :\n";
    print_regex_arr(@SAFECMDEXCL);
    print "\nmboxsafecmd:  Commands safe only if they are surrounded by \\mbox command:\n";
    print_regex_arr(@MBOXCMDLIST);
    print "\nnmboxsafecmd: Commands not safe:\n";
    print_regex_arr(@MBOXCMDEXCL);
  }

  if ($showtext) {
    print "\nCommands with last argument textual (unless excluded) and safe in every context:\n";
    print_regex_arr(@TEXTCMDLIST);
    print
      "\nContext1 commands (last argument textual, command will be disabled in deleted passages, last argument will be shown as plain text):\n";
    print_regex_arr(@CONTEXT1CMDLIST);
    print
      "\nContext2 commands (last argument textual, command and its argument will be disabled in deleted passages):\n";
    print_regex_arr(@CONTEXT2CMDLIST);
    print "\nExclude list of Commands with last argument not textual (overrides patterns above):\n";
    print_regex_arr(@TEXTCMDEXCL);
  }

  if ($showconfig) {
    print "Configuration variables:\n";
    print "ARRENV=$ARRENV\n";
    print "COUNTERCMD=$COUNTERCMD\n";
    print "FLOATENV=$FLOATENV\n";
    print "ITEMCMD=$ITEMCMD\n";
    print "LISTENV=$LISTENV\n";
    print "MATHARRENV=$MATHARRENV\n";
    #    print "MATHARRREPL=$MATHARRREPL\n";     # this is not deprecated and thus no longer shown
    print "MATHENV=$MATHENV\n";
    print "MATHREPL=$MATHREPL\n";
    print "MAXCHANGESLETTER=$MAXCHANGESLETTER\n";
    print "MINWORDSBLOCK=$MINWORDSBLOCK\n";
    print "PICTUREENV=$PICTUREENV\n";
    print "SCALEDELGRAPHICS=$SCALEDELGRAPHICS\n";
    print "VERBATIMENV=$VERBATIMENV\n";
    print "VERBATIMLINEENV=$VERBATIMLINEENV\n";
    print "CUSTOMDIFCMD=$CUSTOMDIFCMD\n";
  }
}

## guess_encoding(filename)
## reads the first 20 lines of filename and looks for call of inputenc package
## if found, return the option of this package (encoding), otherwise return utf8
sub guess_encoding {
  my ($filename) = @_;
  my ( $i, $enc );
  open( FH, $filename ) or die("Couldn't open $filename: $!");
  $i = 0;
  while (<FH>) {
    next if /^\s*%/;    # skip comment lines
    if (m/\\usepackage\[(\w*?)\]\{inputenc\}/) {
      close(FH);
      return ($1);
    }
    last if ( ++$i > 20 );    # scan at most 20 non-comment lines
  }
  close(FH);
  ### return("ascii");
  return ("utf8");
}

sub read_file_with_encoding {
  my ($output);
  my ( $filename, $encoding ) = @_;

  if ( lc($encoding) eq "utf8" ) {
    open( FILE, "<:utf8", $filename ) or die("Couldn't open $filename: $!");
    local $/;    # locally set record operator to undefined, ie. enable whole-file mode
    $output = <FILE>;
  } elsif ( lc($encoding) eq "ascii" ) {
    open( FILE, $filename ) or die("Couldn't open $filename: $!");
    local $/;    # locally set record operator to undefined, ie. enable whole-file mode
    $output = <FILE>;
  } else {
    require Encode;
    open( FILE, "<", $filename ) or die("Couldn't open $filename: $!");
    local $/;    # locally set record operator to undefined, ie. enable whole-file mode
    $output = <FILE>;
    print STDERR "Converting $filename from $encoding to utf8\n" if $verbose;
    $output = Encode::decode( $encoding, $output );
  }
  close FILE;
  if ( $^O eq "linux" ) {
    $output =~ s/\r\n/\n/g;
  }
  return $output;
}

## %packages=list_packages(@preamble)
## scans the arguments for \documentclass,\RequirePackage and \usepackage statements and constructs a hash
## whose keys are the included packages, and whose values are the associated optional arguments
#sub list_packages {
#  my (@preamble)=@_;
#  my %packages=();
#  foreach $line ( @preamble ) {
#    # get rid of comments
#    $line=~s/(?<!\\)%.*$// ;
#    if ( $line =~ m/\\(?:documentclass|usepackage|RequirePackage)(?:\[(.+?)\])?\{(.*?)\}/ ) {
##      print STDERR "Found something: |$line|\n" if $debug;
#      if (defined($1)) {
#	$packages{$2}=$1;
#      } else {
#	$packages{$2}="";
#      }
#    }
#  }
#  return (%packages);
#}

# %packages=list_packages($preamble)
# scans the arguments for \documentclass,\RequirePackage and \usepackage statements and constructs a hash
# whose keys are the included packages, and whose values are the associated optional arguments
# if argument of \usepackage or \RequirePackage is comma separated list, treat as different packages
sub list_packages {
  my ($preamble) = @_;
  my %packages = ();
  my $pkg;

  # remove comments
  $preamble =~ s/(?<!\\)%.*$//mg;

  while ( $preamble =~ m/\\(?:documentclass|usepackage|RequirePackage)(?:\[($brat_n)\])?\{(.*?)\}/gs ) {
    if ( defined($1) ) {
      foreach $pkg ( split /,/, $2 ) {
        $packages{$pkg} = $1;
      }
    } else {
      foreach $pkg ( split /,/, $2 ) {
        $packages{$pkg} = "";
      }
    }
  }

  # sometimes, class options are defined in such a way that they imply the loading and/or presence of a package
  # so we also treat all class options as 'packages.
  if ( $preamble =~ m/\\documentclass\s*\[($brat_n)\]\s*\{.*?\}/s ) {
    foreach $pkg ( split /,/, $1 ) {
      $pkg =~ s/\s//g;    # remove space and newline characters
      $packages{$pkg} = "" unless exists( $packages{$pkg} );
    }
  }
  return (%packages);
}

# Subroutine add_safe_commands modified from version provided by S. Gouezel
# add_safe_commands($preamble)
# scans the argument for \newcommand and \DeclareMathOperator,
# and adds the created commands which are clearly safe to @SAFECMDLIST
sub add_safe_commands {
  my ($preamble) = @_;

  # get rid of comments
  $preamble =~ s/(?<!\\)%.*$//mg;

  my $to_test = "";
  # test for \DeclareMathOperator{\foo}{myoperator}
  while ( $preamble =~ m/\DeclareMathOperator\s*\*?\{\\(\w*?)\}/osg ) {
    $to_test = $1;
    if (  $to_test ne ""
      and not iscmd( $to_test, \@SAFECMDLIST, \@SAFECMDEXCL )
      and not iscmd( $to_test, \@SAFECMDEXCL, [] ) )
    {
      # one should add $to_test to the list of safe commands.
      init_regex_arr_list( \@SAFECMDLIST, $to_test );
      print STDERR "Adding $to_test to the list of safe commands\n" if $verbose;
    }
  }

  while ( $preamble =~ m/\\(?:new|renew|provide)command\s*{\\(\w*)\}(?:|\[\d*\])\s*\{(${pat_n})\}/osg ) {
    my $maybe_to_test  = $1;
    my $should_be_safe = $2;
    print STDERR "DEBUG Checking new command: maybe_to_test, should_be_safe: $1 $2\n" if $debug;
    my $success = 0;
    # skip custom diff commands
    next if ( $maybe_to_test =~ m/^(?:ADD|DEL)?${CUSTOMDIFCMD}$/ );
    ###print STDERR "DEBUG: really test it. \n";
    # test if all latex commands inside it are safe
    $success = 1;
    if ( $should_be_safe =~ m/\\\\/ ) {
      $success = 0;
    } else {
      while ( $should_be_safe =~ m/\\(\w+)/g ) {
        ###	  print STDERR "DEBUG: Testing command $1 " if $debug;
        $success = 0 unless iscmd( $1, \@SAFECMDLIST, \@SAFECMDEXCL );    ### or $1 eq "";
        ###        print STDERR " success=$success\n" if $debug;
      }
    }
    ###      }
    if ($success) {
      $to_test = $maybe_to_test;
      if ( not iscmd( $to_test, \@SAFECMDLIST, \@SAFECMDEXCL ) and not iscmd( $to_test, \@SAFECMDEXCL, [] ) ) {
        #        # one should add $to_test to the list of safe commands.
        init_regex_arr_list( \@SAFECMDLIST, $to_test );
        print STDERR "Adding $to_test to the list of safe commands\n" if $verbose;
      }
    }
  }
}

# helper function for flatten
# remove \endinput at beginning of line and everything
# following it.
# If \endinput is not at the beginning of
# the line, nothing will be removed. It is assumed that
# this case is most common when \endinput is part of a
# conditional clause.  The file will only be processed
# correctly if the conditional is always false,
# i.e. \endinput # not actually reached
sub remove_endinput {
  # s/// operates on default input
  $_[0] =~ s/^\\endinput.*\Z//ms;
  return ( $_[0] );
}

# flatten($text,$preamble,$filename,$encoding)
# expands \input and \include commands within text
# expands \bibliography command with corresponding bbl file if available
# expands \subfile command (from subfiles package - not part of standard text distribution)
# expands \import etc commands (from import package - not part of standard text distribution)
# preamble is scanned for includeonly commands
# encoding is the encoding
# Does not expand codes if they are in the argument of verbatim commands \verb or \listinline

sub flatten {
  my ( $text, $preamble, $filename, $encoding ) = @_;
  my (
    $includeonly, $dirname, $fname,   $newpage, $fullfile, $filecontent, $replacement, $begline,
    $inputcmd,    $bblfile, $subfile, $command, $verbenv,  $verboptions, $ignore,      $fileonly
  );
  my ( $subpreamble, $subbody,    $subpost );
  my ( $subdir,      $subdirfull, $importfilepath );
  my %verbhash ;  # shadows global %verbhash - here it is used only within flatten 
  require File::Basename;
  ###  require File::Spec ;    # now this is needed even if flatten option not given
  $filename = File::Spec->rel2abs($filename);
  ( $ignore, $dirname, $fileonly ) = File::Spec->splitpath($filename);
  $bblfile = $filename;
  $bblfile =~ s/\.tex$//;
  $bblfile .= ".bbl";

  if ( ($includeonly) = ( $preamble =~ m/\\includeonly\{(.*?)\}/ ) ) {
    $includeonly =~ s/,/|/g;
  } else {
    $includeonly = '.*?';
  }

  #print STDERR "DEBUG: VERBATIMENV |$VERBATIMENV| VERBATIMLINEENV |$VERBATIMLINEENV|\n";
  print STDERR "DEBUG: includeonly $includeonly\n" if $debug;

  # Run through filter, to let filterscript have a pass if it was set
  $text = filter($text);

  #turn verbatim environments into hashes
  $text =~  s/^((?:[^%\n]|\\%)*)\\begin\{($VERBATIMENV|$VERBATIMLINEENV)\}(.*?)\\end\{\2\}/"${1}\\DIF${2}{". tohash(\%verbhash,"${3}") . "}"/esgm;
  
  #turn verbatim commands into hashes (but not if they are themselves in comments)
  $text =~  s/^((?:[^%\n]|\\%)*)\\lstinline((?:\[$brat_n\])?)(\{(?:.*?)\})/"${1}\\DIFlstinline". $2 ."{". tohash(\%verbhash,"${3}") ."}"/esgm;
  $text =~  s/^((?:[^%\n]|\\%)*)\\lstinline((?:\[$brat_n\])?)(([^\s\w]).*?\4)/"${1}\\DIFlstinline". $2 ."{". tohash(\%verbhash,"${3}") ."}"/esgm;
  ### $text =~  s/\\(verb\*?|lstinline)([^\s\w])(.*?)\2/"\\DIF${1}{". tohash(\%verbhash,"${2}${3}${2}") ."}"/esg;
  $text =~  s/^((?:[^\n%]|\\%)*)\\(verb\*?|lstinline)([^\s\w])(.*?)\3/"${1}\\DIF${2}{". tohash(\%verbhash,"${3}${4}${3}") ."}"/esgm;
  

  # Recursively replace \\import, \\subimport, and related import commands
  $text =~ s/(^(?:[^%\n]|\\%)*)(\\(sub)?(?:import|inputfrom|includefrom))\{(.*?)\}(?:[\s]*)\{(.*?)\}/{
          #  (--------1-------)(--(=3=)-------------2-------------------)  (-4-)             (-5-)
          # $1 is begline
          # $2 is the import macro name
          # $3 is (optional) prefix "sub"
          # $4 is directory
          # $5 is filename
          $begline = (defined($1)? $1 : "");
          $subdir = $4;
          $fname = $5;
          $fname .= ".tex" unless $fname =~ m|\.\w{3,4}$|;
          print STDERR "DEBUG begline:", $begline, "\n" if $debug;
          print STDERR "DEBUG", (defined($3)? "subimport_file:" : "import_file:"), $subdir, "\n" if $debug;
          print STDERR "DEBUG file:", $fname, "\n" if $debug;

          # subimport appends $subdir to the current $dirname.  import replaces it with an absolute path.
          $subdirfull = (defined($3) ? File::Spec->catdir($dirname,$subdir) : $subdir);

          $importfilepath = File::Spec->catfile($subdirfull, $fname);

          print STDERR "importing importfilepath:", $importfilepath,"\n" if $verbose;
          if ( -f $importfilepath ) {
              # If file exists, replace input or include command with expanded input
              #TODO: need remove_endinput & newpage similar to other replacements inside flatten
              $replacement=flatten(read_file_with_encoding($importfilepath, $encoding), $preamble,$importfilepath,$encoding);
          } else {
              # if file does not exist, do not expand include or input command (do not warn if fname contains #[0-9] as it is then likely part of a command definition
              # and is not meant to be expanded directly
              print STDERR "WARNING: Could not find included file ",$importfilepath,". I will continue but not expand |$2|\n";
              $replacement = $2;
              $replacement .= "{$subdir}{$fname} % Processed";
          }
          "$begline$replacement";
  }/exgm;

  # recursively replace \\input and \\include files
  $text =~ s/(^(?:[^%\n]|\\%)*)(\\input\{(.*?)\}|\\include\{(${includeonly}(?:\.tex)?)\})/{
	    $begline=(defined($1)? $1 : "") ;
	    $inputcmd=$2;
	    $fname = $3 if defined($3) ;
	    $fname = $4 if defined($4) ;
            $newpage=(defined($4)? " \\newpage " : "") ;
            #      # add tex extension unless there is a three or four letter extension already
            $fname .= ".tex" unless $fname =~ m|\.\w{3,4}$|;
            $fullfile = File::Spec->catfile($dirname,$fname);
            print STDERR "DEBUG Beg of line match |$1|\n" if defined($1) && $debug ;
            print STDERR "Include file $fname\n" if $verbose;
            print STDERR "DEBUG looking for file ",$fullfile, "\n" if $debug;
            # content of file becomes replacement value (use recursion), add \newpage if the command was include
            if ( -f $fullfile ) {
	      # If file exists, replace input or include command with expanded input
	      $replacement=flatten(read_file_with_encoding($fullfile, $encoding), $preamble,$filename,$encoding);
	      $replacement = remove_endinput($replacement);
	      # \include always starts a new page; use explicit \newpage command to simulate this
	    } else {
	      # if file does not exist, do not expand include or input command (do not warn if fname contains #[0-9] as it is then likely part of a command definition
              # and is not meant to be expanded directly
	      print STDERR "WARNING: Could not find included file ",$fullfile,". I will continue but not expand |$inputcmd|\n" unless $fname =~ m(#[0-9]) ;
	      $replacement = $inputcmd ;   # i.e. just the original command again -> make no change file does not exist
	      $newpage="";
	    }
	    "$begline$newpage$replacement$newpage";
          }/exgm;

  # replace bibliography with bbl file if it exists
  $text =~ s/(^(?:[^%\n]|\\%)*)\\bibliography\{(.*?)\}/{
           if ( -f $bblfile ){
	     $replacement=read_file_with_encoding(File::Spec->catfile($bblfile), $encoding);
	   } else {
	     warn "Bibliography file $bblfile cannot be found. No flattening of \\bibliography done. Run bibtex on old and new files first";
	     $replacement="\\bibliography{$2}";
	   }
	   $begline=(defined($1)? $1 : "") ;
	   "$begline$replacement";
  }/exgm;

  # replace subfile with contents (subfile package)
  $text =~ s/(^(?:[^%\n]|\\%)*)\\subfile\{(.*?)\}/{
           $begline=(defined($1)? $1 : "") ;
     	   $fname = $2;
           #      # add tex extension unless there is a three or four letter extension already
           $fname .= ".tex" unless $fname =~ m|\.\w{3,4}|;
###           print STDERR "DEBUG Beg of line match |$1|\n" if defined($1) && $debug ;
           print STDERR "Include file as subfile $fname\n" if $verbose;
###           print STDERR "DEBUG looking for file |",File::Spec->catfile($dirname,$fname), "|\n" if $debug;
           # content of file becomes replacement value (use recursion)
           # now strip away everything outside and including \begin{document} and \end{document} pair#
	   #             # note: no checking for comments is made
           $fullfile=File::Spec->catfile($dirname,$fname);
           if ( -f $fullfile) {
	     # if file exists, expand \subfile command by contents of file
	     $subfile=read_file_with_encoding($fullfile,$encoding) or die "Could not open included subfile ",$fullfile,": $!";
	     ($subpreamble,$subbody,$subpost)=splitdoc($subfile,'\\\\begin\{document\}','\\\\end\{document\}');
	     ###           $subfile=~s|^.*\\begin{document}||s;
	     ###           $subfile=~s|\\end{document}.*$||s;
	     $replacement=flatten($subbody, $preamble,$fullfile,$encoding);
	     ### $replacement = remove_endinput($replacement);
	   } else {
	      # if file does not exist, do not expand subfile
	      print STDERR "WARNING: Could not find subfile ",$fullfile,". I will continue but not expand |$2|\n" unless $fname =~ m(#[0-9]) ;
	      $replacement = "\\subfile\{$2\}" ;   # i.e. just the original command again -> make no change file does not exist
	    }

	   "$begline$replacement";
  }/exgm;

  # replace \verbatiminput and \lstlistinginput
  $text =~ s/(^(?:[^%\n]|\\%)*)\\(verbatiminput\*?|lstinputlisting)$extraspace(\[$brat_n\])?$extraspace\{(.*?)\}/{
     $begline=(defined($1)? $1 : "") ;
     $command = $2 ;
     $fname = $4 ;
     $verboptions = defined($3)? $3 : "" ;
     if ($command eq 'verbatiminput' ) {
       $verbenv = "verbatim" ;
     } elsif ($command eq 'verbatiminput*' ) {
       $verbenv = "verbatim*" ;
     } elsif ($command eq 'lstinputlisting' ) {
       $verbenv = "lstlisting" ;
     } else {
       die "Internal errorL Unexpected verbatim input type $command.\n";
     }
     print STDERR "DEBUG Beg of line match |$begline|\n" if $debug ;
     print STDERR "Include file $fname  verbatim\n" if $verbose;
     print STDERR "DEBUG looking for file ",File::Spec->catfile($dirname,$fname), "\n" if $debug;
     # content of file becomes replacement value (do not use recursion), add \newpage if the command was include
     ###$replacement=read_file_with_encoding(File::Spec->catfile($dirname,$fname), $encoding) or die "Couldn't find file ",File::Spec->catfile($dirname,$fname),": $!";
     $replacement=read_file_with_encoding(File::Spec->catfile($dirname,$fname), $encoding); # (cannot on apparent failure as this triggers for empty fie. Original:  or die "Couldn't find file ",File::Spec->catfile($dirname,$fname),": $!";
     # Add a new line if it not already there (note that the matching operator needs to use different delimiters, as we are still inside an outer scope that takes precedence
     $replacement .= "\n" unless  $replacement =~ m(\n$)  ;
     "$begline\\begin{$verbenv}$verboptions\n$replacement\\end{$verbenv}\n";
    }/exgm;
 
  # recover original text from hashed verbatim commands
  $text =~ s/\\DIF((?:verb\*?|lstinline(?:\[$brat_n\])?))\{([-\d]*?)\}/"\\${1}". fromhash(\%verbhash,${2})/esg;
  # recover original text from hashed verbatim environments
  $text =~ s/\\DIF((?:$VERBATIMENV|$VERBATIMLINEENV)(?:\[$brat_n\])?)\{([-\d]*?)\}/"\\begin{${1}}".fromhash(\%verbhash,$2)."\\end{${1}}"/esg;
  ###print STDERR $text . "THE END";
  return ($text);
}

# print_regex_arr(@arr)
# prints regex array without x-ism expansion put in by pearl to stdout
sub print_regex_arr {
  my $dumstring;

  $dumstring = "";
  foreach (@_) {
    s/\(\?\^u?:\^(.*?)\$\)/$1/g;
    next unless /[a-z]/;
    $dumstring .= "$_ ";
  }
  $dumstring = join( " ", @_ );    # PERL generates string (?-xism:^ref$) for quoted refex ^ref$
        #$dumstring =~ s/\(\?-xism:\^(.*?)\$\)/$1/g;   # remove string and ^,$ marks before output
        #$dumstring =~ s/\(\^\?u:\^(.*?)\$\)/$1/g;   # remove string and ^,$ marks before output
        #(?^u:^title$)
        #$dumstring =~ s/\(\?\^u:\^(.*?)\$\)/$1/g;   # remove string and ^,$ marks before output
  print $dumstring, "\n";
}

# @lines=extrapream($type,...)
# reads line from appendix or external file
# (end of file after __END__ token)
# if $type is a filename, it will read the file instead of reading from the appendix
# otherwise it will screen appendix for line "%DIF $TYPE" and copy everything up to line
# '%DIF END $TYPE' (where $TYPE is upcased version of $type)
# extrapream('-nofail',$type) will---instead of failing---simply return nothing if
# it does not find the matching line in appendix (do not use -nofail option with multiple types!)
sub extrapream {
  my @types = @_;
  my ( $type, $arg );
  my $nofail = 0;
  ###my @retval=("%DIF PREAMBLE EXTENSION ADDED BY LATEXDIFF") ;
  my @retval = ();
  my ($copy);

###  while (@_) {
  foreach $arg (@types) {
    if ( $arg eq '-nofail' ) {
      $nofail = 1;
      next;
    }
    $type = $arg;
    $copy = 0;
###    $type=shift ;
    if ( -f $type || lc $type eq '/dev/null' ) {
      print STDERR "Reading preamble file $type\n" if $verbose;
      open( FILE, $type ) or die "Cannot open preamble file $type: $!";
      if ( defined($encoding) ) {
        binmode( FILE, ":encoding($encoding)" );
      } else {
        require Encode::Locale;
        binmode( FILE, ":encoding(locale)" );
      }
      while (<FILE>) {
        chomp;
        if ( $_ =~ m/%DIF PREAMBLE/ ) {
          push( @retval, "$_" );
        } else {
          push( @retval, "$_ %DIF PREAMBLE" );
        }
      }
    } else {    # not (-f $type)
      $type = uc($type);    # upcase argument
      print STDERR "Preamble Internal Type $type\n" if $verbose;
      # save filehandle position (before first read this points to line after __END__)
      # but seek DATA,0,0 resets it to the beginning of the file
      # see https://stackoverflow.com/questions/4459601/how-can-i-use-data-twice
      my $data_start = tell DATA;
      while (<DATA>) {
        if (m/^%DIF $type/) {
          $copy = 1;
        } elsif (m/^%DIF END $type/) {
          last;
        }
        chomp;
        push( @retval, "$_ %DIF PREAMBLE" ) if $copy;
      }
      if ( $copy == 0 ) {
        unless ($nofail) {
          print STDERR "\nPreamble style $type not implemented.\n";
          print STDERR "Write latexdiff -h to get help with available styles\n";
          exit(2);
        }
      }
      seek DATA, $data_start, 0;    # rewind DATA handle to beginning of data record
    }
  }
  ###push (@retval,"%DIF END PREAMBLE EXTENSION ADDED BY LATEXDIFF")  ;
  return @retval;
}

# ($part1,$part2,$part3)=splitdoc($text,$word1,$word2)
# splits $text into 3 parts at $word1 and $word2.
# if neither $word1 nor $word2 exist, $part1 and $part3 are empty, $part2 is $text
# If only $word1 or $word2 exist but not the other, output an error message.

# NB this version avoids $` and $' for performance reason although it only makes a tiny difference
# (in one test gain a tenth of a second for a 30s run)
sub splitdoc {
  my ( $text, $word1, $word2 ) = @_;
  my ( $part1, $part2, $part3 ) = ( "", "", "" );
  my ( $rest, $pos );

  if ( $text =~ m/(^[^%]*)($word1)/mg ) {
    $pos   = pos $text;
    $part1 = substr( $text, 0, $pos - length($2) );
    $rest  = substr( $text, $pos );
###    $part1=$` . $1 ; # $` is Left of match
###    $rest=$';  # $' is Right of match
###    print STDERR "pos $pos length part1 ", length($part1),length($part1a), " length rest ", length($rest),length($rest1a),"\n";
    if ( $rest =~ m/(^[^%]*)($word2)/mg ) {
      $pos   = pos $rest;
      $part2 = substr( $rest, 0, $pos - length($2) );
      $part3 = substr( $rest, $pos );
###      $part2=$` . $1; # $` is Left of match
###      $part3=$';  # $' is Right of match
###    print STDERR "length part2 ", length($part2), " length part3 ", length($part3),"\n";
    } else {
      die "$word1 and $word2 not in the correct order or not present as a pair.";
    }
  } else {
    $part2 = $text;
    die "$word2 present but not $word1." if ( $text =~ m/(^[^%]*)$word2/ms );
  }
  return ( $part1, $part2, $part3 );
}

### Original splitdoc which did not treat \begin{document} and \end{document} in comments properly
### sub splitdoc {
###   my ($text,$word1,$word2)=@_;
###   my $l1 = length $word1 ;
###   my $l2 = length $word2 ;

###   my $i = index($text,$word1);
###   my $j = index($text,$word2);

###   my ($part1,$part2,$part3)=("","","");

###   if ( $i<0 && $j<0) {
###     # no $word1 or $word2
###     print STDERR "Old Document not a complete latex file. Assuming it is a tex file with no preamble.\n";
###     $part2 = $text;
###   } elsif ( $i>=0 && $j>$i ) {
###     $part1 = substr($text,0,$i) ;
###     $part2 = substr($text,$i+$l1,$j-$i-$l1);
###     $part3 = substr($text,$j+$l2) unless $j+$l2 >= length $text;
###   } else {
###     die "$word1 or $word2 not in the correct order or not present as a pair."
###   }
###   return ($part1,$part2,$part3);
### }

# bodydiff($old,$new)
sub bodydiff {
  my ( $oldwords, $newwords ) = @_;
  my @retwords;

  print STDERR "(", exetime(), " s)\n", "Splitting into latex tokens \n" if $verbose;
  print STDERR "Parsing $oldfile \n" if $verbose;
  my @oldwords = splitlatex($oldwords);
  print STDERR "Parsing $newfile \n" if $verbose;
  my @newwords = splitlatex($newwords);

  if ($debug) {
    open( TOKENOLD, ">", "latexdiff.debug.tokenold" );
    print TOKENOLD join( "***\n", @oldwords );
    close(TOKENOLD);
    open( TOKENNEW, ">", "latexdiff.debug.tokennew" );
    print TOKENNEW join( "***\n", @newwords );
    close(TOKENNEW);
  }

  print STDERR "(", exetime(), " s)\n",
    "Pass 1: Expanding text commands and merging isolated identities with changed blocks  "
    if $verbose;
  pass1( \@oldwords, \@newwords );

  ### print STDERR "(",exetime()," s)\n","tokenizeblocks:  " if $verbose;

  print STDERR "(", exetime(), " s)\n", "Pass 2: inserting DIF tokens and mark up.  " if $verbose;
  # make blocks enclosed by %BEGIN|END DIFFadd|DIFdel into a single token (for markup they will be split again in marktags() )
  tokenizeblocks( \@oldwords, "DIFDEL" );
  tokenizeblocks( \@newwords, "DIFADD" );
  if ($debug) {
    open( TOKENOLD, ">", "latexdiff.debug.tokenold2" );
    print TOKENOLD join( "***\n", @oldwords );
    close(TOKENOLD);
    open( TOKENNEW, ">", "latexdiff.debug.tokennew2" );
    print TOKENNEW join( "***\n", @newwords );
    close(TOKENNEW);
  }

  @retwords = pass2( \@oldwords, \@newwords );

  return (@retwords);
}

# @words=splitlatex($string)
# split string according to latex rules
# Each element of words is either
# a word (including trailing spaces and punctuation)
# a latex command
# if there is white space in the beginning return that as first token
sub splitlatex {
  my ($inputstring) = @_;
  my $string = $inputstring;
  # if input is empty, return empty list
  length($string) > 0 or return ();
  $string =~ s/^(\s*)//s;
  my $leadin = $1;
  length($string) > 0 or return ($leadin);

  my @retval = ( $string =~ m/$pat/osg );

  if ( length($string) != length( join( "", @retval ) ) ) {
    print STDERR
      "\nWARNING: Inconsistency in length of input string and parsed string:\n     This often indicates faulty or non-standard latex code.\n     In many cases you can ignore this and the following warning messages.\n Note that character numbers in the following are counted beginning after \\begin{document} and are only approximate."
      unless $ignorewarnings;
    print STDERR "DEBUG Original length ", length($string), "  Parsed length ", length( join( "", @retval ) ), "\n"
      if $debug;
    print STDERR "DEBUG Input string:  |$string|\n" if ( length($string) < 500 ) && $debug;
    print STDERR "DEBUG Token parsing: |", join( "+", @retval ), "|\n" if ( length($string) < 500 ) && $debug;
    @retval = ();
    # slow way only do this if other m//sg method fails
    my $last = 0;
    while ( $string =~ m/$pat/osg ) {
      my $match = $&;
      if ( $last + length $& != pos $string ) {
### messy section for quick debug, fix so that it doesn't fail even at beginning of file
        my $pos    = pos($string);
        my $offset = 30 < $last ? 30 : $last;
        my $dum    = substr( $string, $last - $offset, $pos - $last + 2 * $offset );
        my $dum1   = $dum;
        my $cnt    = $#retval;
        my $i;
        $dum1 =~ s/\n/ /g;
###	for ($i=$cnt-3; $i<=$#retval; $i++) { print STDERR "$i: |$retval[$i]|\n"; }
        unless ($ignorewarnings) {
          print STDERR "\n$dum1\n";
          print STDERR " " x 30, "^" x ( $pos - $last ), " " x 30, "\n";
          print STDERR "Missing characters near word "
            . ( scalar @retval )
            . " character index: "
            . $last . "-"
            . pos($string)
            . " Length: "
            . length($match)
            . " Match: |$match| (expected match marked above).\n";
        }
        # put in missing characters `by hand'
###	print STDERR "DEBUG Before correction |@retval| correct with |",substr($dum,20,$pos-$last-length($match)), "|\n" if $verbose;
###        print STDERR "DEBUG last $last length ", $last-10,"\n" if $verbose;
        push( @retval, substr( $dum, $offset, $pos - $last - length($match) ) );
        #       Note: there seems to be a bug in substr with utf8 that made the following line output substr which were too long,
        #             using dum instead appears to work
        #	push (@retval, substr($string,$last, pos($string)-$last-length($match)));
      }
      push( @retval, $match );
      $last = pos $string;
    }

  }

  unshift( @retval, $leadin ) if ( length($leadin) > 0 );
  return @retval;
}

# pass1( \@seq1,\@seq2)
# Look for differences between seq1 and seq2.
# Where an common-subsequence block is flanked by deleted or appended blocks,
# and is shorter than $MINWORDSBLOCK words it is appended
# to the last deleted or appended word.  If the block contains tokens other than words
# or punctuation it is not merged.
# Deleted or appended block consisting of words and safe commands only are
# also merged, to prevent break-up in pass2 (after previous isolated words have been removed)
# If there are commands with textual arguments (e.g. \caption) both in corresponding
# appended and deleted blocks split them such that the command and opening bracket
# are one token, then the rest is split up following standard rules, and the closing
# bracket is a separate token, ie. turn
# "\caption{This is a textual argument}" into
# ("\caption{","This ","is ","a ","textual ","argument","}")
# No return value.  Destructively changes sequences
sub pass1 {
  my $seq1 = shift;
  my $seq2 = shift;

  my $len1 = scalar @$seq1;
  my $len2 = scalar @$seq2;
  # Note: I tried to include range 0-9 as acceptable characters, but in 2 cases in the testsuite, this led to
  # arguably worse outcomes, and for 3 it was neutral (5 changes in total in 3 files). This is not representative
  # but based on this evidence I skip
  my $wpat = qr/^(?:[a-zA-Z.,'`:;?()!\/]*)[\s~]*$/;    #'

  my ( $last1, $last2 ) = ( -1, -1 );
  my $cnt         = 0;
  my $block       = [];
  my $addblock    = [];
  my $delblock    = [];
  my $todo        = [];
  my $instruction = [];
  my $i;
  my ( @delmid, @addmid, @dummy );

  my ( $addcmds, $delcmds, $matchindex );
  my ( $addtextblocks, $deltextblocks );
  my ( $addtokcnt,     $deltokcnt, $mattokcnt ) = ( 0, 0, 0 );
  my ( $addblkcnt,     $delblkcnt, $matblkcnt ) = ( 0, 0, 0 );

  my $adddiscard = sub {
### print "DISCARD $_[0] $_[1] $cnt $seq1->[$_[0]] $seq2->[$_[1]]\n";
    if ( $cnt > 0 ) {
      $matblkcnt++;
      # just after an unchanged block
      #			print STDERR "Unchanged block $cnt, $last1,$last2 \n";
      if (
        $cnt < $MINWORDSBLOCK
        && $cnt == scalar(
          grep {
            /^$wpat/
              || ( /^(?:\\protect)?\\((?:[`'^"~=.]|[\w\d@*]+))((?:\[$brat_n\]|\{$pat_n\})*)/o
              && iscmd( $1, \@SAFECMDLIST, \@SAFECMDEXCL )
              && scalar( @dummy = split( " ", $2 ) ) < 3 )
          } @$block
        )
        )
      {
        # merge identical blocks shorter than $MINWORDSBLOCK
        # and only containing ordinary words
        # with preceding different word
        # We cannot carry out this merging immediately as this
        # would change the index numbers of seq1 and seq2 and confuse
        # the algorithm, instead we store in @$todo where we have to merge
###			  print STDERR "Merge identical block $last1,$last2,$cnt,|@$block|",grep( /$wpat/, @$block ),"\n";
        push( @$todo, [ $last1, $last2, $cnt, @$block ] );
      }
      $block = [];
      $cnt   = 0;
      $last1 = -1;
      $last2 = -1;
    }
  };
  my $discard = sub {
    $deltokcnt++;
    &$adddiscard;    #($_[0],$_[1]);
    push( @$delblock, [ $seq1->[ $_[0] ], $_[0] ] );
    $last1 = $_[0];
  };

  my $add = sub {
    $addtokcnt++;
    &$adddiscard;    #($_[0],$_[1]);
    push( @$addblock, [ $seq2->[ $_[1] ], $_[1] ] );
    $last2 = $_[1];
  };

  my $match = sub {
    $mattokcnt++;
###print "MATCH $_[0] $_[1] $cnt $seq1->[$_[0]] $seq2->[$_[1]]\n";
    if ( $cnt == 0 ) {    # first word of matching sequence after changed sequence or at beginning of word sequence
      $deltextblocks = extracttextblocks($delblock);
      $delblkcnt++ if scalar @$delblock;
      $addtextblocks = extracttextblocks($addblock);
      $addblkcnt++ if scalar @$addblock;
###		      print STDERR "DEBUG: match after sequence\n";
###		      print STDERR "delblock:",scalar @$deltextblocks,"\n";
###                   for (my $i=0;$i< scalar @$delblock;$i++) {
###                         my ($token,$index)=@{ $delblock->[$i]};
###			    print STDERR "|$token| $index\n" };
###		      print STDERR "addblock:\n";
###                   for (my $i=0;$i< scalar @$addblock;$i++) {
###			my ($token,$index)=@{ $addblock->[$i]} ;
###			print STDERR "|$token| $index\n" };

      # make a list of all TEXTCMDLIST commands in deleted and added blocks
      $delcmds = extractcommands($delblock);
      $addcmds = extractcommands($addblock);
      # now find those text commands, which are found in both deleted and added blocks, and expand them
      # keygen(third argument of _longestCommonSubsequence) implies to sort on command (0th elements of $addcmd elements)
      # the calling format for longestCommonSubsequence has changed between versions of
      # Algorithm::Diff so we need to check which one we are using
      if ( $algodiffversion > 1.15 ) {
        ### Algorithm::Diff 1.19
        $matchindex = Algorithm::Diff::_longestCommonSubsequence( $delcmds, $addcmds, 0, sub { $_[0]->[0] } );
      } else {
        ### Algorithm::Diff 1.15
        $matchindex = Algorithm::Diff::_longestCommonSubsequence( $delcmds, $addcmds, sub { $_[0]->[0] } );
      }

      for ( $i = 0 ; $i <= $#$matchindex ; $i++ ) {
        if ( defined( $matchindex->[$i] ) ) {
          $j      = $matchindex->[$i];
          @delmid = splitlatex( $delcmds->[$i][3] );
### this looks wrong although it seemed to have worked fine previously			  @addmid=splitlatex($addcmds->[$i][3]);
          @addmid = splitlatex( $addcmds->[$j][3] );
### old buggy version (but maybe best)			  while (scalar(@$deltextblocks)  && $deltextblocks->[0][0]<$delcmds->[$i][2]) {
          while ( scalar(@$deltextblocks) && $deltextblocks->[0][0] < $delcmds->[$i][1] ) {
            my ( $index, $block, $cnt ) = @{ shift(@$deltextblocks) };
###			    print STDERR "DELTEXTBLOCK Index $index Length $cnt |@$block|\n";
            push( @$todo, [ $index, -1, $cnt, @$block ] );
          }
          push( @$todo, [ $delcmds->[$i][1], -1, -1, $delcmds->[$i][2], @delmid, $delcmds->[$i][4] ] );

### old buggy version (but maybe best)			  while (scalar(@$addtextblocks) && $addtextblocks->[0][0]<$addcmds->[$j][2]) {
          while ( scalar(@$addtextblocks) && $addtextblocks->[0][0] < $addcmds->[$j][1] ) {
            my ( $index, $block, $cnt ) = @{ shift(@$addtextblocks) };
###			    print STDERR "ADDTEXTBLOCK Index $index Length $cnt |@$block|\n";
            push( @$todo, [ -1, $index, $cnt, @$block ] );
          }
### this looks wrong although it seemed to have worked			  push(@$todo, [ -1,$addcmds->[$j][1],-1,$addcmds->[$i][2],@addmid,$addcmds->[$i][4]]);
          push( @$todo, [ -1, $addcmds->[$j][1], -1, $addcmds->[$j][2], @addmid, $addcmds->[$j][4] ] );
        }
      }
      # mop up remaining textblocks
      while ( scalar(@$deltextblocks) ) {
        my ( $index, $block, $cnt ) = @{ shift(@$deltextblocks) };
###                        print STDERR "DELTEXTBLOCK Index $index Length $cnt |@$block|\n";
        push( @$todo, [ $index, -1, $cnt, @$block ] );
      }
      while ( scalar(@$addtextblocks) ) {
        my ( $index, $block, $cnt ) = @{ shift(@$addtextblocks) };
###                        print STDERR "ADDTEXTBLOCK Index $index Length $cnt |@$block|\n";
        push( @$todo, [ -1, $index, $cnt, @$block ] );
      }

      $addblock = [];
      $delblock = [];
    }
    push( @$block, $seq2->[ $_[1] ] );
    $cnt++;
  };

  my $keyfunc = sub { join( "  ", split( " ", shift() ) ) };

  traverse_sequences( $seq1, $seq2, { MATCH => $match, DISCARD_A => $discard, DISCARD_B => $add }, $keyfunc );

  # now carry out the merging/splitting.  Refer to elements relative from
  # the end (with negative indices) as these offsets don't change before the instruction is executed
  # cnt>0: merged small unchanged groups with previous changed blocks
  # cnt==-1: split textual commands into components
  foreach $instruction (@$todo) {
    ( $last1, $last2, $cnt, @$block ) = @$instruction;
    if ( $cnt >= 0 ) {
      splice( @$seq1, $last1 - $len1, 1 + $cnt, join( "", $seq1->[ $last1 - $len1 ], @$block ) ) if $last1 >= 0;
      splice( @$seq2, $last2 - $len2, 1 + $cnt, join( "", $seq2->[ $last2 - $len2 ], @$block ) ) if $last2 >= 0;
    } else {
###      print STDERR "COMD TYPE $last1 $len1 $last2 $len2 Block |@$block|\n",scalar @$seq1," ",scalar @$seq2,"\n";
      splice( @$seq1, $last1 - $len1, 1, @$block ) if $last1 >= 0;
      splice( @$seq2, $last2 - $len2, 1, @$block ) if $last2 >= 0;
    }
  }

  if ($verbose) {
    print STDERR "\n";
    print STDERR "  $mattokcnt matching  tokens in $matblkcnt blocks.\n";
    print STDERR "  $deltokcnt discarded tokens in $delblkcnt blocks.\n";
    print STDERR "  $addtokcnt appended  tokens in $addblkcnt blocks.\n";
  }
}

# extracttextblocks(\@blockindex)
# $blockindex has the following format
# [ [ token1, index1 ], [token2, index2],.. ]
# where index refers to the index in the original old or new word sequence
# Returns: reference to an array of the form
# [[ $index, $textblock, $cnt ], ..
# where $index index of block to be merged
#       $textblock contains all the words to be merged with the word at $index (but does not contain this word)
#       $cnt   is length of block
#
# requires: iscmd
#
sub extracttextblocks {
  my $block = shift;
  my ( $i, $token, $index );
  my $textblock = [];
  my $last      = -1;
  my $wpat      = qr/^(?:[a-zA-Z.,'`:;?()!]*)[\s~]*$/;    #'
  my $retval    = [];

  # we redefine locally $extraspace (shadowing the global definition) to capture command sequences with intervening spaces no matter what the global setting
  # this is done so we can capture those commands with a predefined number of arguments without having to introduce them again explicitly here
  my $extraspace = '\s*';

  for ( $i = 0 ; $i < scalar @$block ; $i++ ) {
    ( $token, $index ) = @{ $block->[$i] };
    # store pure text blocks
### pre-0.3    if ($token =~ /$wpat/ ||  ( $token =~/^\\([\w\d*]+)((?:\[$brat_n\]|\{$pat_n\})*)/o
    if (
      $token =~ /$wpat/
      || ( $token =~
        /^(?:\\protect)?\\((?:[`'^"~=.]|[\w\d@\*]+))((?:${extraspace}\[$brat_n\]${extraspace}|${extraspace}\{$pat_n\})*)/
        && iscmd( $1, \@SAFECMDLIST, \@SAFECMDEXCL )
        && !iscmd( $1, \@TEXTCMDLIST, \@TEXTCMDEXCL ) )
      )
    {
      # we have text or a command which can be treated as text
      if ( $last < 0 ) {
        # new pure-text block
        $last = $index;
      } else {
        # add to pure-text block
        push( @$textblock, $token );
      }
    } else {
      # it is not text
      if ( scalar(@$textblock) ) {
###	print STDERR "TEXTBLOCK at index $last, length ", scalar(@$textblock), " |@$textblock|\n";
        push( @$retval, [ $last, $textblock, scalar(@$textblock) ] );
      }
      $textblock = [];
      $last      = -1;
    }
  }
  # finish processing a possibly unfinished block before returning
  if ( scalar(@$textblock) ) {
    push( @$retval, [ $last, $textblock, scalar(@$textblock) ] );
  }
  return ($retval);
}

# extractcommands( \@blockindex )
# $blockindex has the following format
# [ [ token1, index1 ], [token2, index2],.. ]
# where index refers to the index in the original old or new word sequence
# Returns: reference to an array of the form
# [ [ "\cmd1", index, "\cmd1[optarg]{arg1}{", "arg2" ,"} " ],..
# where index is just taken from input array
# command must have a textual argument as last argument
#
# requires: iscmd
#
sub extractcommands {
  my $block = shift;
  my ( $i, $token, $index, $cmd, $open, $mid, $closing );
  my $retval = [];

  # we redefine locally $extraspace (shadowing the global definition) to capture command sequences with intervening spaces no matter what the global setting
  # this is done so we can capture those commands with a predefined number of arguments without having to introduce them again explicitly here
  my $extraspace = '\s*';

  for ( $i = 0 ; $i < scalar @$block ; $i++ ) {
    ( $token, $index ) = @{ $block->[$i] };
    # check if token is an alphanumeric command sequence with at least one non-optional argument
    # \cmd[...]{...}{last argument}
    # Capturing in the following results in these associations
    # $1: \cmd[...]{...}{
    # $2: \cmd
    # $3: last argument
    # $4: }  + trailing spaces
### pre-0.3    if ( ( $token =~ m/^(\\([\w\d\*]+)(?:\[$brat0\]|\{$pat_n\})*\{)($pat_n)(\}\s*)$/so )
    if (
      (
        $token =~
        m/^((?:\\protect)?\\([\w\d\*]+)(?:${extraspace}\[$brat_n\]|${extraspace}\{$pat_n\})*${extraspace}\{)($pat_n)(\}\s*)$/so
      )
      && iscmd( $2, \@TEXTCMDLIST, \@TEXTCMDEXCL )
      )
    {
      print STDERR "DEBUG EXTRACTCOMMANDS Match |$1|$2|$3|$4|$index \n" if $debug;
      #      push(@$retval,[ $2,$index,$1,$3,$4 ]);
      ( $cmd, $open, $mid, $closing ) = ( $2, $1, $3, $4 );
      $closing =~ s/\}/\\RIGHTBRACE/;
###      print STDERR "EXTRACTCOMMANDS Match |$cmd|$open|$mid|$closing|$index \n";
      push( @$retval, [ $cmd, $index, $open, $mid, $closing ] );
    }
  }
  return $retval;
}

# iscmd($cmd,\@regexarray,\@regexexcl) checks
# return 1 if $cmd matches any of the patterns in the
# array $@regexarray, and none of the patterns in \@regexexcl, otherwise return 0
sub iscmd {
  my ( $cmd, $regexar, $regexexcl ) = @_;
  my ($ret) = 0;
  ### print STDERR "DEBUG: iscmd($cmd) in @$regexar, \n---------\n excluding @$regexexcl or @TEXTCMDEXCL safe @SAFECMDEXCL \n" if $debug;
  ### print STDERR "DEBUG: iscmd($cmd)=" if $debug;
  foreach $pat (@$regexar) {
    if ( $cmd =~ m/^${pat}$/ ) {
      $ret = 1;
      last;
    }
  }
  ### print STDERR "0\n" if ($debug && !$ret) ;
  return 0 unless $ret;
###  print STDERR "DEBUG: Maybe\n" if $debug;
  foreach $pat (@$regexexcl) {
###    print STDERR "DEBUG iscmd: checking |$cmd| against |$pat|\n" if $debug;
###    print STDERR "DEBUG MATCH\n" if ($debug && $cmd =~ m/^${pat}$/);
    ### print STDERR "0\n" if ( $debug && $cmd =~ m/^${pat}$/) ;
    return 0 if ( $cmd =~ m/^${pat}$/ );
  }
###  print STDERR "DEBUG: Yes\n" if $debug;
  ### print STDERR "1\n" if $debug;
  return 1;
}

# tokenizeblocks( \@seq, $blocktype)
# destructively turn blocks enclosed by %BEGIN|END $blocktype into a single token for the sequence pointed
# to by \@seq
sub tokenizeblocks {
  my ( $seq, $blocktype ) = @_;
  my @new_seq    = ();
  my @accumulate = ();
  my ($token);
  my @midtokens;
  my @matches;
  my ( $i, $cmd, $opening, $mid, $closing );
  my $mode;    # 0: copy mode, 1: accumulate mode (inside block)

  $mode = 0;
  $i    = 0;
  while ( $i <= $#$seq ) {
    $token = $seq->[$i];
    # check if BEGIN/END and block directive is present in the argument of any textcmd. This will be in an
    # unchanged block. (textcmds in changed blocks would have already been expanded in pass1)
    if ( $token =~
      m/^((?:\\protect)?\\([\w\d\*]+)(?:${extraspace}\[$brat_n\]|${extraspace}\{$pat_n\})*${extraspace}\{)($pat_n)(\}?\s*)$/so
      )
    {
      ( $cmd, $opening, $mid, $closing ) = ( $2, $1, $3, $4 );
      #print STDERR "DEBUG tokenizeblocks  Match $i: |$1|$2|$3|$4|\n";
      if ( iscmd( $cmd, \@TEXTCMDLIST, \@TEXTCMDEXCL ) ) {
        # command is a text command
        if ( $mid =~ m/%(?:BEGIN|END) DIF(?:ADD|DEL|NOMARKUP)/ ) {
          # if it contains a directive
          # => we expand the interior of the text command and continue processing
          @midtokens = splitlatex($mid);
          ###print STDERR "DEBUG tokenizeblocks: midtokens $#$seq $#midtokens|\n";
          #$closing =~ s/\}/\\RIGHTBRACE/ ;
          splice( @$seq, $i, 1, $opening, @midtokens, $closing );
          ####print STDERR "DEBUG tokenizeblocks: $#$seq|\n";
          next;    # the next will cause the freshly expanded tokens to be parsed again
        }
      }
      if ( @matches = ( $token =~ m/(%(?:BEGIN|END) DIF(?:ADD|DEL|NOMARKUP).*)/g ) ) {
        # any directive in non-text command or earlier arguments
        # neuter the directives, so that they do not appear again in the next iteration
        $token =~ s/%BEGIN DIF(ADD|DEL|NOMARKUP)/%begin DIF$1/g;
        $token =~ s/%END DIF(ADD|DEL|NOMARKUP)/%end DIF$1/g;
        ### print STDERR "DEBUG command : Match $i, ",scalar @matches," |$token|",join("-",@matches),"\n";
        if ( scalar @matches > 1 || $matches[0] =~ m/%END/ ) {
          splice( @$seq, $i, 0, shift(@matches) . " AUX\n" );
          splice( @$seq, $i + 1, 1, $token, map { "$_ AUX\n" } @matches );    # append the directives as separate tokens
        } else {
          splice( @$seq, $i, 1, $token, map { "$_ AUX\n" } @matches );        # append the directives as separate tokens
        }
        next;
      }
    }
    $i++;
    #foreach $token ( @$seq ) {
    if ( $token =~ m/^%BEGIN $blocktype/ ) {
      if ( $mode == 1 ) {
        print STDERR
          "WARNING: Two consecutive %BEGIN $blocktype directive detected. Maybe the preceding %END $blocktype was placed in a command argument and overlooked?\n";
        # We assume that this occurs because previous %END $blocktype was overlooked rather than actual nesting
        # therefore we append the accumulated tokens as indivual tokens, effectively ignoring the previous BEGIN directive but
        # honouring the current one
        push( @new_seq, @accumulate );
      }
      $mode       = 1;
      @accumulate = ($token);
    } elsif ( $token =~ m/^%END $blocktype/ ) {
      if ($mode) {
        # regular behaviour
        $mode = 0;
        push( @accumulate, $token );
        push( @new_seq, join( "", @accumulate ) );    # append the merged tokens so they appear as a single token
      } else {
        print STDERR
          "WARNING: %END $blocktype directive without preceding BEGIN $blocktype. Maybe the preceding %BEGIN $blocktype was placed in a command argument and overlooked?\n";
        # We assume that this occurs because previous %BEGIN $blocktype was overlooked rather than actual nesting
        # We have to do nothing here (except add the token to the sequence)
        push( @new_seq, $token );
      }
    } elsif ($mode) {
      push( @accumulate, $token );
    } else {
      push( @new_seq, $token );
    }
  }
  @$seq = @new_seq;
}

# pass2( \@seq1,\@seq2)
# Look for differences between seq1 and seq2.
# Mark begin and end of deleted and appended sequences with tags $DELOPEN and $DELCLOSE
# and $ADDOPEN and $ADDCLOSE, respectively, however exclude { } & and all comands, unless
# they match an element of the whitelist (SAFECMD)
# For words in TEXTCMD but not in SAFECMD, enclose interior with $ADDOPEN and $ADDCLOSE brackets
# Deleted comment lines are marked with %DIF <
# Added comment lines are marked with %DIF >
sub pass2 {
  my $seq1 = shift;
  my $seq2 = shift;

  my ( $addtokcnt, $deltokcnt, $mattokcnt ) = ( 0, 0, 0 );
  my ( $addblkcnt, $delblkcnt, $matblkcnt ) = ( 0, 0, 0 );

  my $retval  = [];
  my $delhunk = [];
  my $addhunk = [];

  # State variable that should be accessible to subroutines
  local $suppress_markup = 0;    # 0: do not block markup, 1: block markup  (supporting DIFNOMARKUP directives)

  my $discard = sub {
    $deltokcnt++;
### print "DISCARD $_[0],$_[1]: $seq1->[$_[0]]\n";
    push( @$delhunk, $seq1->[ $_[0] ] );
  };

  my $add = sub {
    $addtokcnt++;
### print "APPEND $_[0],$_[1]: $seq2->[$_[1]]\n";
    push( @$addhunk, $seq2->[ $_[1] ] );
  };

  my $match = sub {
    $mattokcnt++;
    if ( scalar @$delhunk ) {
### print "MATCH: adding delhunk size ", scalar @$delhunk,"\n" ;
      $delblkcnt++;
      # mark up changes, but comment out commands
      push @$retval,
        marktags( $DELMARKOPEN, $DELMARKCLOSE, $DELOPEN, $DELCLOSE, $DELCMDOPEN, $DELCMDCLOSE, $DELCOMMENT, $delhunk );
      $delhunk = [];
    }
    if ( scalar @$addhunk ) {
### print "MATCH: adding addhunk size ", scalar @$addhunk,"\n" ;
      $addblkcnt++;
      # we mark up changes, but simply quote commands
      push @$retval, marktags( $ADDMARKOPEN, $ADDMARKCLOSE, $ADDOPEN, $ADDCLOSE, "", "", $ADDCOMMENT, $addhunk );
      $addhunk = [];
    }
    push( @$retval, $seq2->[ $_[1] ] );
    # Update DIFNOMARKUP counter
    ### # save procedure
    ### my $cnt_bnomarkup = scalar(grep { /^%BEGIN DIFNOMARKUP/ } @$retval);
    ### my $cnt_enomarkup = scalar(grep { /^%END DIFNOMARKUP/ } @$retval);
    ### if ( $cnt_bnomarkup == $cnt_enomarkup+1 && !$suppress_markup ) {
    ###   $suppress_markup = 1;
    ### } elsif ( $cnt_bnomarkup+1 == $cnt_enomarkup && $suppress_markup ) {
    ###   $suppress_markup = 0;
    ### } elsif { $cnt_bnomarkup == $cnt_enomarkup ) {
    ###   pass;     # DIFNOMARKUP directives are paired appropriately
    ### } else {
    ###   print STDERR "WARNING: DIFNOMARKUP nesting incorrect. Using last value to determine next state irrespective of earlier state\n";
    # shortcut relying on the last DIFNOMARKUP directive; this relies on proper nesting

    my @nomarkups = grep ( /^%(BEGIN|END) DIFNOMARKUP/, $seq2->[ $_[1] ] );

    if ( scalar @nomarkups ) {
      if ( $nomarkups[-1] =~ /^%BEGIN DIFNOMARKUP/ ) {
        $suppress_markup = 1;
      } elsif ( $nomarkups[-1] =~ /^%END DIFNOMARKUP/ ) {
        $suppress_markup = 0;
      }
    }
    ###        }
  };

  my $keyfunc = sub { join( "  ", split( " ", shift() ) ) };

  traverse_sequences( $seq1, $seq2, { MATCH => $match, DISCARD_A => $discard, DISCARD_B => $add }, $keyfunc );
  # clear up unprocessed hunks
  push @$retval,
    marktags( $DELMARKOPEN, $DELMARKCLOSE, $DELOPEN, $DELCLOSE, $DELCMDOPEN, $DELCMDCLOSE, $DELCOMMENT, $delhunk )
    if scalar @$delhunk;
  push @$retval, marktags( $ADDMARKOPEN, $ADDMARKCLOSE, $ADDOPEN, $ADDCLOSE, "", "", $ADDCOMMENT, $addhunk )
    if scalar @$addhunk;

  if ($verbose) {
    print STDERR "\n";
    print STDERR "  $mattokcnt matching  tokens. \n";
    print STDERR "  $deltokcnt discarded tokens in $delblkcnt blocks.\n";
    print STDERR "  $addtokcnt appended  tokens in $addblkcnt blocks.\n";
  }
  return (@$retval);
}

# marktags($openmark,$closemark,$open,$close,$opencmd,$closecmd,$comment,\@block)
# returns ($openmark,$open,$block,$close,$closemark) if @block contains no commands (except white-listed ones),
# braces, ampersands, or comments
# mark comments with $comment
# exclude all other exceptions from scope of open, close like this
# ($openmark, $open,...,$close, $opencmd,command, command,$closecmd, $open, ..., $close, $closemark)
# If $opencmd begins with "%" marktags assumes it is operating on a deleted block, otherwise on an added block.
# marktags also respects the local variable $suppress_markup, which if set to 1 will block markup; and also
# updates it if encountering DIFNOMARKUP directives
sub marktags {
  my ( $openmark, $closemark, $open, $close, $opencmd, $closecmd, $comment, $block ) = @_;
  my $word;
  my (@argtext);
  my $retval     = [];
  my $noncomment = 0;     # flag to indicate whether we have already written a non-comment token
  my $cmd        = -1;    # -1 at beginning 0: last token written is a ordinary word
                          # 1: last token written is a command
                          # for keeping track whether we are just in a command sequence or in a word sequence
  my $cmdcomment = ( $opencmd =~ m/^%/ ); # Flag to indicate whether opencmd is a comment (i.e. if we intend to simply comment out changed commands). Usually this means we are in a deleted block
  my ( $command, $commandword, $closingbracket );    # temporary variables needed below to remember sub-pattern matches
  our $suppress_markup;    # we need to keep track across function calls, and also modifications outside

  # split this block to split sequences joined in pass1, and %BEGIN|END DIFADD|DIFDEL blocks
  ### print STDERR "DEBUG: marktags before splitlatex blocksplit ",join("|",@$block),"\n" if $debug;
  @$block = splitlatex( join "", @$block );
  ### print STDERR "DEBUG: marktags $openmark,$closemark,$open,$close,$opencmd,$closecmd,$comment\n" if $debug;
  print STDERR "DEBUG: after splitlatex ", join( "|", @$block ), "\n" if $debug;

  # we redefine locally $extraspace (shadowing the global definition) to capture command sequences with intervening spaces no matter what the global setting
  # this is done so we can capture those commands with a predefined number of arguments without having to introduce them again explicitly here
  my $extraspace_mt = '\s*';

  foreach (@$block) {
    $word = $_;
    ### print STDERR "DEBUG MARKTAGS: |$word| $suppress_markup | $cmdcomment\n" ;
    # check for DIFNOMARKUP tags but ignore them in deleted blocks
    if ( !$cmdcomment && $word =~ /^%BEGIN DIFNOMARKUP/ ) {
      $suppress_markup = 1;
      # close any open blocks if needed:
      push( @$retval, $close )     if $cmd == 0;
      push( @$retval, $closecmd )  if $cmd == 1;
      push( @$retval, $closemark ) if ($noncomment);
      push( @$retval, $closecmd );

      push( @$retval, $word );

      # reset state as if at the the beginning of marktags
      $cmd        = -1;
      $noncomment = 0;

      next;
    }
    if ( !$cmdcomment && $word =~ /^%END DIFNOMARKUP/ ) {
      $suppress_markup = 0;
      push( @$retval, $word );
      next;
    }
    if ($suppress_markup) {
      # simply add the words as received without marking up
      push( @$retval, $word );
      next;
    }
    if ( $word =~ s/^%/%$comment/ ) {
      # a comment
###      print STDERR "MARKTAGS: Add comment |$word|\n";
      if ( $cmd == 1 ) {
        push( @$retval, $closecmd );
        $cmd = -1;
      }
      push( @$retval, $word );
      next;
    }
    if ( $word =~ m/^\s*$/ ) {
      ### print STDERR "DEBUG MARKTAGS: whitespace detected |$word| cmdcom |$cmdcomment| |$opencmd|\n" if $debug;
      # a sequence of white-space characters - this should only ever happen for the first element of block.
      # in deleted block, omit, otherwise just copy it in
      if ( !$cmdcomment ) {    # ignore in deleted blocks
        push( @$retval, $word );
      }
      next;
    }
    if ( !$noncomment ) {
      push( @$retval, $openmark );
      $noncomment = 1;
    }
    # negative lookahead pattern (?!) in second clause is put in to avoid matching \( .. \) patterns
    # also note that second pattern will match \\
###    print STDERR "DEBUG marktags: Considering word |$word|\n" if $debug;
    if ( $word =~ /^[&{}\[\]]/
      || ( $word =~ /^(?:\\protect)?\\(?!\()(\\|[`'^"~=.]|[\w*@]+)/ && !iscmd( $1, \@SAFECMDLIST, \@SAFECMDEXCL ) ) )
    {
###      print STDERR "DEBUG MARKTAGS is a non-safe command\n" if $debug;
      ###    if ( $word =~ /^[&{}\[\]]/ || ( $word =~ /^\\([\w*@\\% ]+)/ && !iscmd($1,\@SAFECMDLIST,\@SAFECMDEXCL)) ) {
      # word is a command or other significant token (not in SAFECMDLIST)
      ## same conditions as in subroutine extractcommand:
      # check if token is an alphanumeric command sequence with at least one non-optional argument
      # \cmd[...]{...}{last argument}
      # Capturing in the following results in these associations
      # $1: \cmd[...]{...}{
      # $2: cmd
      # $3: last argument
      # $4: }  + trailing spaces
      ### pre-0.3    if ( ( $token =~ m/^(\\([\w\d\*]+)(?:\[$brat0\]|\{$pat_n\})*\{)($pat_n)(\}\s*)$/so )
      if (
        (
          $word =~
          m/^((?:\\protect)?\\([\w\d\*]+)(?:${extraspace_mt}\[$brat_n\]|${extraspace_mt}\{$pat_n\})*${extraspace_mt}\{)($pat_n)(\}\s*)$/so
        )
        && ( iscmd( $2, \@TEXTCMDLIST, \@TEXTCMDEXCL ) || iscmd( $2, \@MATHTEXTCMDLIST, \@MATHTEXTCMDEXCL ) )
        && ( !$cmdcomment || !iscmd( $2, \@CONTEXT2CMDLIST, \@CONTEXT2CMDEXCL ) )
        )
      {
        # Condition 1: word is a command? - if yes, $1,$2,.. will be set as above
        # Condition 2: word is a text command - we mark up the interior of the word. There is a separate check for MATHTEXTCMDLIST
        #              because for $mathmarkup=WHOLE, the commands should not be split in pass1 (ie. math mode commands are not in
        #              TEXTCMDLIST, but the interior of MATHTEXT commnds should be highlighted in both deleted and added blocks
        # Condition 3: But if we are in a deleted block ($cmdcomment=1) and
        #            $2 (the command) is in context2, just treat it as an ordinary command (i.e. comment it open with $opencmd)
        # Because we do not want to disable this command
        # here we do not use $opencmd and $closecmd($opencmd is empty)
        print STDERR "DEBUG: Detected text |$word| but not safe command \$2: $2 \$3: $3\n." if $debug;
###	push (@$retval,$closecmd,$open) if $cmd==1 ;
        if ( $cmd == 1 ) {
          push( @$retval, $closecmd );
        } elsif ( $cmd == 0 ) {
          push( @$retval, $close );
        }
        $command        = $1;
        $commandword    = $2;
        $closingbracket = $4;
        @argtext        = splitlatex($3);    # split textual argument into tokens
### print STDERR "DEBUG: command|$command| commandword|$commandword| closingbracket|$closingbracket| argtext|@argtext|\n" if $debug;
        # and mark it up (but we do not need openmark and closemark)
        # insert command with initial arguments, marked-up final argument, and closing bracket
        if ( $cmdcomment && iscmd( $commandword, \@CONTEXT1CMDLIST, \@CONTEXT1CMDEXCL ) ) {
          # context1cmd in a deleted environment; delete command itself but keep last argument, marked up
          push( @$retval, $opencmd );
          $command =~ s/\n/\n${opencmd}/sg;    # repeat opencmd at the beginning of each line
                                               # argument, note that the additional comment character is included
                                               # to suppress linebreak after opening parentheses, which is important
                                               # for latexrevise
          push( @$retval,
            $command, "%\n{$AUXCMD\n", marktags( "", "", $open, $close, $opencmd, $closecmd, $comment, \@argtext ),
            $closingbracket );
        } elsif ( iscmd( $commandword,, \@MATHTEXTCMDLIST, \@MATHTEXTCMDEXCL ) ) {
          # MATHBLOCK pseudo command: consider all commands safe, except & and \\, \begin and \end and a few package specific one (look at UNSAFEMATHCMD definition)
          # Keep these commands even in deleted blocks, hence set $opencmd and $closecmd (5th and 6th argument of marktags) to
          # ""
          local @SAFECMDLIST = (".*");
          local @SAFECMDEXCL = ( '\\', '\\\\', @UNSAFEMATHCMD );
###	  print STDERR "DEBUG: Command $command argtext ",join(",",@argtext),"\n" if $debug;
          push(
            @$retval, $command, marktags( "", "", $open, $close, "", "", $comment, \@argtext )    #@argtext
            , $closingbracket
          );
        } else {
          # normal textcmd or context1cmd in an added block
          push( @$retval,
            $command, marktags( "", "", $open, $close, $opencmd, $closecmd, $comment, \@argtext ),
            $closingbracket );
        }
        push( @$retval, $AUXCMD, "\n" ) if $cmdcomment;
        $cmd = -1;
      } elsif (
        $cmdcomment
        && ( $word =~
          m/^(\\([\w\d\*]+)(?:${extraspace_mt}\[$brat_n\]|${extraspace_mt}\{$pat_n\})*${extraspace_mt}\{)($pat_n)(\}\s*)/so
        )
        && iscmd( $2, \@KEEPCMDLIST, \@KEEPCMDEXCL )
        )
      {
###	print STDERR "DEBUG: Detected KEEPCMD command $1 \n." if $debug;
        # 'keepcmd' in a deleted environment: keep  the command as is
        push( @$retval, $close ) if $cmd == 0;
        push( @$retval, $word );
        $cmd = -1; # pretend we are at the beginning of a sequence because we do not want to add an additional $closecmd or $close before the next token, no matter what it is
      } else {
        # ordinary command
###	print STDERR "DEBUG: Ordinary command $2 \n." if $debug;
        push( @$retval, $opencmd ) if $cmd == -1;
        push( @$retval, $close, $opencmd ) if $cmd == 0;
        $word =~ s/\n/\n${opencmd}/sg if $cmdcomment; # if opencmd is a comment, repeat this at the beginning of every line
        ### print STDERR "MARKTAGS: Add command |$word|\n";
        push( @$retval, $word );
        $cmd = 1;
      }
    } else {
      ###print STDERR "DEBUG MARKTAGS is an ordinary word or SAFECMD command \n" if $debug;
      # just an ordinary word or command in SAFECMD
      push( @$retval, $open ) if $cmd == -1;
      push( @$retval, $closecmd, $open ) if $cmd == 1;
      ###TODO:  check here if it is a command in MBOXCMD list, and surround it with \mbox{...}
      ### $word =~ /^\\(?!\()(\\|[`'^"~=.]|[\w*@]+)/ &&  iscmd($1,\@MBOXCMDLIST,\@MBOXCMDEXCL))
      ### but actually this check has been carried out already so can simply check if word begins with backslash
      if ( $word =~ /^(?:\\protect)?\\(?!\()(\\|[`'^"~=.]|[\w*@]+)(.*?)(\s*)$/s
        && iscmd( $1, \@MBOXCMDLIST, \@MBOXCMDEXCL ) )
      {
        # $word is a safe command in MBOXCMDLIST
        ###print STDERR "DEBUG Mboxsafecmd detected:$word:\n" if $debug ;
        push( @$retval, "\\mbox{$AUXCMD\n\\" . $1 . $2 . $3 . "}\\hskip0pt$AUXCMD\n" );
      } else {
        # $word is a normal word or a safe command (not in MBOXCMDLIST)
        push( @$retval, $word );
      }
      $cmd = 0;
    }
  }
  push( @$retval, $close )    if $cmd == 0;
  push( @$retval, $closecmd ) if $cmd == 1;

  push( @$retval, $closemark ) if ($noncomment);
###  print STDERR "MARKTAGS: BEFORE |@$block|\n";
###  print STDERR "MARKTAGS: AFTER |@$retval|\n";
  return @$retval;
}

#used in preprocess
sub take_comments_and_newline_from_frac() {
  # some special magic for common usage of frac, which does not conform to the latexdiff requirements but can be made to fit
  # note that this is a rare exception to the general rule that the new tex can be reconstructed from the diff file

  # regex that matches space and comment characters
  my $space = qr/\s|%[^\n]*?/;
  # \frac {abc} -> \frac{abc}
  # \frac1 -> \frac{1}
  # \frac a -> \frac{a}
  # \frac \lambda -> \frac{\lambda}
  s/\\frac(?|${space}+\{($pat_n)\}|${space}*(\d)|${space}+(\w)|${space}*(\\[a-zA-Z]+))/\\frac\{$1\}/g;
  # same as above for the second argument of frac
  s/\\frac(\{$pat_n\})(?|${space}*\{($pat_n)\}|${space}*(\d)|${space}+(\w)|${space}*(\\[a-zA-Z]+))/\\frac$1\{$2\}/g;
}

# preprocess($string, ..)
# carry out the following pre-processing steps for all arguments:
# 1. Remove leading white-space
#    Change \{ to \QLEFTBRACE and \} to \QRIGHTBRACE and \& to \AMPERSAND
### pre 1.0.4 BEGINDIF,ENDDIF substitution
### #. change begin and end commands  within comments to BEGINDIF, ENDDIF
###    so they don't disturb the pattern matching (if there are several \begin or \end in one line, this
###    will still cause a problem
# #.   Change {,},\frac in comments to \CLEFTBRACE, \CRIGHTBRACE, \CFRAC
# 2. mark all first empty line (in block of several) with \PAR tokens
# 3. Convert all '\%' into '\PERCENTAGE ' and all '\$' into \DOLLAR to make parsing regular expressions easier
# 4. Convert all \verb|some verbatim text| commands (where | can be an arbitrary character)
#    into \verb{hash}  (also lstinline)
# 5. Convert \begin{verbatim} some verbatim text \end{verbatim} into \verbatim{hash}  (not only verbatim, all patterns matching VERBATIMENV)
# 6. Convert _n into \SUBSCRIPTNB{n} and _{nnn} into \SUBSCRIPT{nn}
# 7. Convert ^n into \SUPERSCRIPTNB{n} and ^{nnn} into \SUPERSCRIPT{nn}
# 8. a. Convert $$ $$ into \begin{DOLLARDOLLAR} \end{DOLLARDOLLAR}
#    b. Convert \[ \] into \begin{SQUAREBRACKET} \end{SQUAREBRACKET}
# 9. Convert all picture environmentent (\begin{PICTUREENV} .. \end{PICTUREENV} \PICTUREBLOCKenv
#     For math-mode COARSE,WHOLE or NONE option -convert all \begin{MATH} .. \end{MATH}
#    into \MATHBLOCKmath{...} commands, where MATH/math is any valid math environment

# 10. Add final token STOP to the very end.  This is put in because the algorithm works better if the last token is identical.  This is removed again in postprocessing.
#
# NB: step 6 and 7 is likely to  convert some "_" inappropriately, e.g. in file
#     names or labels but it does not matter because they are converted back in the postprocessing step
# Returns: leading white space removed in step 1
sub preprocess {
###  my @leadin=() ;
  for (@_) {
###    s/^(\s*)//s;
###    push(@leadin,$1);

    # change in \verb and similar commands - note that I introduce an extra space here so that the
    #       already hashed variants do not trigger again
    # transform \lstinline{...}
    #    s/\\lstinline(\[$brat0\])?(\{(?:.*?)\})/"\\DIFlstinline". $1 ."{". tohash(\%verbhash,"$2") ."}"/esg;
    #    s/\\lstinline(\[$brat0\])?((\S).*?\2)/"\\DIFlstinline". $1 ."{". tohash(\%verbhash,"$2") ."}"/esg;
    s/\\lstinline((?:\[$brat_n\])?)(\{(?:.*?)\})/"\\DIFlstinline". $1 ."{". tohash(\%verbhash,"$2") ."}"/esg;
    s/\\lstinline((?:\[$brat_n\])?)(([^\s\w]).*?\3)/"\\DIFlstinline". $1 ."{". tohash(\%verbhash,"$2") ."}"/esg;
    s/\\(verb\*?|lstinline)([^\s\w])(.*?)\2/"\\DIF${1}{". tohash(\%verbhash,"${2}${3}${2}") ."}"/esg;

    s/(?<!\\)\\%/\\PERCENTAGE /g;    # (?<! is negative lookbehind assertion to prevent \\% from being converted

    #    Change \{ to \QLEFTBRACE, \} to \QRIGHTBRACE, and \& to \AMPERSAND
###    print STDERR "Preprocess 0\n" if $debug;
    s/(?<!\\)\\\{/\\QLEFTBRACE /sg;
    s/(?<!\\)\\\}/\\QRIGHTBRACE /sg;
    s/(?<!\\)\\&/\\AMPERSAND /sg;
###    print STDERR "Preprocess 2\n" if $debug;
### pre 1.0.4
###    # change begin and end commands  within comments such that they
###    # don't disturb the pattern matching (if there are several \begin or \end in one line
###    # this substitution is insufficient but that appears unlikely)
###    s/(%.*)\\begin\{(.*)$/$1\\BEGINDIF\{$2/mg ;
###    s/(%.*)\\end\{(.*)$/$1\\ENDDIF\{$2/mg ;
### replace {,}, \frac in comments with \\CLEFTBRACE,\\CRIGHTBRACE, CFRAC to protect from special treatment
###    these commands have been moved down after verbatim environments have turned into comments
###    1 while s/((?<!\\)%.*)\{(.*)$/$1\\CLEFTBRACE $2/mg ;
###    1 while s/((?<!\\)%.*)\}(.*)$/$1\\CRIGHTBRACE $2/mg ;
###    1 while s/((?<!\\)%.*)\\frac(.*)$/$1\\CFRAC $2/mg ;

###    writedebugfile($_,'preprocess1');

    # replace {,} with \CLEFTBRACE,\CRIGHTBRACE
    1 while s/(%.*)\{(.*)$/$1\\CLEFTBRACE $2/mg;
    1 while s/(%.*)\}(.*)$/$1\\CRIGHTBRACE $2/mg;

###    s/\n(\s*)\n((?:\s*\n)*)/\\PAR\n$2/g ;
    s/(?<!\\)\\\$/\\DOLLAR /g;    # (?<! is negative lookbehind assertion to prevent \\$ from being converted
###    s/\\begin\{(verbatim\*?)\}(.*?)\\end\{\1\}/"\\${1}{". tohash(\%verbhash,"${2}") . "}"/esg;
    s/\\begin\{($VERBATIMENV)\}(.*?)\\end\{\1\}/"\\${1}{". tohash(\%verbhash,"${2}") . "}"/esg;
    s/\\begin\{($VERBATIMLINEENV)\}(.*?)\\end\{\1\}/"\\begin{$1}". linecomment($2) . "\\end{$1}"/esg;
###    writedebugfile($_,'preprocess-intermediate');

    # replace {,}, \frac,_,^ in comments with \CLEFTBRACE,\CRIGHTBRACE, \CFRAC, \CUNDERSCORE, \CCARET, respectively to protect from special treatment
    # note that we need to do this after having turned verbatim environments into comments
    # (an exception is for {,} as otherwise the processing of the verbatim environments themselves might be affected)
    # We solve this by simpling doint the CLEFTBRACE,CRIGHTBRACE conversion twice.
###   since 1.3.5 we can simplify these expressions as literal percentage (\%) has already be converted so we can trust % to indicate comment
###    1 while s/((?<!\\)%.*)\{(.*)$/$1\\CLEFTBRACE $2/mg ;
###    1 while s/((?<!\\)%.*)\}(.*)$/$1\\CRIGHTBRACE $2/mg ;
###    1 while s/((?<!\\)%.*)\\frac(.*)$/$1\\CFRAC $2/mg ;
    1 while s/(%.*)\{(.*)$/$1\\CLEFTBRACE $2/mg;
    1 while s/(%.*)\}(.*)$/$1\\CRIGHTBRACE $2/mg;
    1 while s/(%.*)\\frac(.*)$/$1\\CFRAC $2/mg;
    1 while s/(%.*)\\sqrt(.*)$/$1\\CSQRT $2/mg;
    1 while s/(%.*)_(.*)$/$1\\CUNDERSCORE $2/mg;
    1 while s/(%.*)^(.*)$/$1\\CCARET $2/mg;

    # mark all first empty line (in block of several) with \PAR tokens
    s/\n(\s*?)\n((?:\s*\n)*)/\n$1\\PAR\n$2/g;
    # Convert _n or _\cmd into \SUBSCRIPTNB{n} or \SUBSCRIPTNB{\cmd} and _{nnn} into \SUBSCRIPT{nn}
    1 while s/(?<!\\)_(\s*([^{\\\s]|\\\w+))/\\SUBSCRIPTNB{$1}/g;
    1 while s/(?<!\\)_(\s*{($pat_n)})/\\SUBSCRIPT$1/g;
    # Convert ^n into \SUPERSCRIPTNB{n} and ^{nnn} into \SUPERSCRIPT{nn}
    1 while s/(?<!\\)\^(\s*([^{\\\s]|\\\w+))/\\SUPERSCRIPTNB{$1}/g;
    1 while s/(?<!\\)\^(\s*{($pat_n)})/\\SUPERSCRIPT$1/g;
    # Convert  \sqrt{n} into \SQRT{n}  and  \sqrt nn into SQRTNB{nn}
    1 while s/(?<!\\)\\sqrt(\s*([^{\\\s]|\\\w+))/\\SQRTNB{$1}/g;
    1 while s/(?<!\\)\\sqrt(\s*{($pat_n)})/\\SQRT$1/g;
    # Convert $$ $$ into \begin{DOLLARDOLLAR} \end{DOLLARDOLLAR}
    s/\$\$(.*?)\$\$/\\begin{DOLLARDOLLAR}$1\\end{DOLLARDOLLAR}/sg;
    # Convert \[ \] into \begin{SQUAREBRACKET} \end{SQUAREBRACKET}
    s/(?<!\\)\\\[/\\begin{SQUAREBRACKET}/sg;
    s/(?<!\\)\\\]/\\end{SQUAREBRACKET}/sg;

    # Convert all picture environmentent (\begin{PICTUREENV} .. \end{PICTUREENV} \PICTUREBLOCKenv
    s/\\begin\{($PICTUREENV)}(.*?)\\end\{\1}/\\PICTUREBLOCK$1\{$2\}/sg;
    #    For math-mode COARSE,WHOLE or NONE option -convert all \begin{MATH} .. \end{MATH}
    #    into \MATHBLOCKMATH{...} commands, where MATH is any valid math environment
    #    Also convert all array environments into ARRAYBLOCK environments.
    #    Where these environments have arguments they become optional arguments to the MATHBLOCK command enclosed in < > brackets
    #    Example: \begin{alignat}{3} ... \end{alignat} will turn into \MATHBLOCKalignat[{3}]{ ... }
###    print STDERR "Preprocess 20\n" if $debug;

    if ( $mathmarkup != FINE ) {
      # DIFANCHORARRB and DIFANCHORARRE, DIFANCHORMATHB and DIFANCHORMATHE markers are inserted here to encourage the matching algorithm
      # to always match up the closing brace. Otherwise sometimes one ends up with a situation where
      # the closing brace is deleted and added at another point. The deleted closing brace is then
      # prevented by a %DIFDELCMD, leading to material leaking in or out of the math environment.
      # The anchors are removed in post-processing again. (note that they are simple text to cause least amount of complications
      # Admittedly, this is something of a hack and will not always work. If it does not, then one needs to
      # resort to WHOLE or FINE, or NONE math mode processing.
###      s/\\begin\{($ARRENV)}(.*?)\\end\{\1}/\\ARRAYBLOCK$1\{$2\\DIFANCHORARRB \}\\DIFANCHORARRE /sg;
      # Previous construction had problems with nested \begin{array} ... \end{array} constructions, so we convert the inner ones
      # first, and then iterate with the "1 while" construction to take care of the outer ones
      1 while
        s/\\begin\{($ARRENV)\}((?:.(?!\\begin\{\1\}))*?)\\end\{\1}/\\ARRAYBLOCK$1\{$2\\DIFANCHORARRB \}\\DIFANCHORARRE /sg;
###      print STDERR "vvvvvvvvvvvvvvvvvv\n$_\nvvvvvvvvvvvvvvvv\n" if $debug;

      take_comments_and_newline_from_frac();

###      print STDERR "^^^^^^^^^^^^^^^^^^\n$_\n^^^^^^^^^^^^^^^^^\n" if $debug;
      # Convert Math environments with arguments
      s/\\begin\{($MATHENV|$MATHARRENV|SQUAREBRACKET)\}((?:\[$brat_n\])|(?:\{$pat_n\}))+(.*?)\\end\{\1\}/\\MATHBLOCK$1\[$2\]\{$3\\DIFANCHORMATHB \}\\DIFANCHORMATHE /sg;
      # Convert Math environments without arguments
      s/\\begin\{($MATHENV|$MATHARRENV|SQUAREBRACKET)\}(.*?)\\end\{\1\}/\\MATHBLOCK$1\{$2\\DIFANCHORMATHB \}\\DIFANCHORMATHE /sg;
    }
###    print STDERR "Preprocess 30\n" if $debug;

    # add final token " STOP"
    $_ .= " STOP";
  }
###  return(@leadin);
}

# $expanded=linecomment($string)
#preface all lines with verbatim marker (usually DIFVRB)
sub linecomment {
  my @verbatimlines = split( "\n", $_[0] );
  # the first line needs special treatment - we do want to retain optional arguments as is but wrap the remainder also with VERBCOMMENT
  ### print STDERR "DEBUG: before verbatimlines[0] = ",$verbatimlines[0],"\n";
  $verbatimlines[0] =~ s/^((?:\s*\[$brat_n\])?\s*)([^\s\[].*)/ defined($2) ? ( "$1\%$VERBCOMMENT$2" ) : ( $1 )/e;
  ### print STDERR "DEBUG: after  verbatimlines[0] = ",$verbatimlines[0],"\n";
  return ( join( "\n%$VERBCOMMENT", @verbatimlines ) . "\n" );
}

# $simple=reverselinecomment($env $string)
# remove DIFVRB comments but leave changed lines marked
sub reverselinecomment {
  my ( $environment, $verbatimtext ) = @_;
  ### print STDERR "DEBUG REVERSELINECOMMENT input: $environment,|$verbatimtext|\n" if $debug;
  # remove markup added by latexdiff
  # (this should occur only if the type of verbatim environment was changed)
  # (note that this destroys some information in old file)
  #  in theory I could save it by moving it out of the verbatim environment
  #  but this requires more bookkeeping and is probably not necessary)
  $verbatimtext =~ s/\\DIFaddbegin //g;
  $verbatimtext =~ s/\\DIFaddend //g;
  $verbatimtext =~ s/\\DIFdelbegin //g;
  $verbatimtext =~ s/\\DIFdelend //g;
  $verbatimtext =~ s/$DELCMDOPEN.*//g;

  # remove DIFVRB mark
  $verbatimtext =~ s/%$VERBCOMMENT//g;

  # remove part of the markup in changed lines
  # if any of these substitution was made, then there was at least
  # one changed line, and we have to extend the style
  if ( $verbatimtext =~ s/$VERBCOMMENT//g ) {
    # in the next line we add ~alsolanguage~ modifier, but also deletes the rest of the line after the optional argument, as lstlisting commands gets sometimes
    # very confused by what is there   (and othertimes seems to ignore this anyway)
    unless ( $verbatimtext =~ s/^(\s*)\[($brat_n)\](.*)\n/$1\[$2,alsolanguage=DIFcode\]\n/ ) {
      if ( $verbatimtext =~ m/^\s*\n/ ) {
        $verbatimtext = "[alsolanguage=DIFcode]" . $verbatimtext;
      } else {
        $verbatimtext = "[alsolanguage=DIFcode]\n" . $verbatimtext;
      }
    }
    # There is a bug in listings package (at least v1.5b) for empty comments where the actual comment command is not made invisible
    # I therefore have to introduce an artificial '-' character at the end of empty added or deleted lines
    $verbatimtext =~ s/($DELCOMMENT\s*)$/$1-/mg;
    $verbatimtext = "\\DIFmodbegin\n\\begin{${environment}}${verbatimtext}\\end{${environment}}\n\\DIFmodend";
  } else {
    $verbatimtext = "\\begin{${environment}}${verbatimtext}\\end{${environment}}";
  }
  ### print STDERR "DEBUG REVERSELINECOMMENT output: |$verbatimtext|\n" if $debug;
  return ($verbatimtext);
}

#hashstring=tohash(\%hash,$string)
# creates a hash value based on string and stores in %hash
sub tohash {
  my ( $hash, $string ) = @_;
  my ( @arr, $val );
  my ( $sum, $i ) = ( 0, 1 );
  my ($hstr);

  @arr = unpack( 'c*', $string );

  while (1) {
    foreach $val (@arr) {
      $sum += $i * $val;
      $i++;
    }
    $hstr = "$sum";
###    $hstr="-$hstr";
    last unless ( defined( $hash->{$hstr} ) && $string ne $hash->{$hstr} );
    # else found a duplicate HASH need to repeat for a higher hash value
  }
  $hash->{$hstr} = $string;
  ###  print STDERR "Hash:$hstr: Content:$string:\n";
  return ($hstr);
}

#string=fromhash(\%hash,$fromstring)
# restores string value stored in hash
#string=fromhash(\%hash,$fromstring,$prependstring)
# additionally begins each line with prependstring
sub fromhash {
  my ( $hash, $hstr ) = ( $_[0], $_[1] );
  my $retstr = $hash->{$hstr};
  if ( $#_ >= 2 ) {
    $retstr =~ s/^/$_[2]/mg;
  }
  return $retstr;
}

# stripdelcmpopen(string)
# return string with $DELCMDOPEN removed
sub stripdelcmdopen {
  my ($str) = $_[0];
  $str =~ s/${DELCMDOPEN}//mg;
  return $str;
}

# writedebugfile(string, label)
# if $debug set writes <string> to file latexdiff.debug.<label>
# otherwise do nothing
sub writedebugfile {
  my ( $string, $label ) = @_;
  if ($debug) {
    open( RAWDIFF, ">", "latexdiff.debug." . $label );
    print RAWDIFF $string;
    close(RAWDIFF);
  }
}

# postprocess($string, ..)
# carry out the following post-processing steps for all arguments:
# * Remove STOP token from the end
# * Replace \RIGHTBRACE by }
### NO LONGER DONE *  change citation commands within comments to protect from processing (using marker CITEDIF)
# * If option --no-del is set delete all deleted blocks
# 1. Check all deleted blocks:
#    a.where a deleted block contains a matching \begin and
#      \end environment (these will be disabled by a %DIFDELCMD statements), for selected environments enable
#      these commands again (such that for example displayed math in a deleted equation
#      is properly within math mode.  For math mode environments replace numbered equation
#      environments with their display only variety (so that equation numbers in new file and
#      diff file are identical).  Where the correct type of math environment cannot be determined
#      use a place holder MATHMODE
#    b.where one of the commands matching $COUNTERCMD is used as a DIFAUXCMD, add a statement
#      subtracting one from the respective counter to keep numbering consistent with new file
#    Replace all MATHMODE environment commands by the correct environment to achieve matching
#    pairs
#    c. Convert MATHBLOCKmath commands to their uncounted numbers (e.g. convert equation -> displaymath
#       (environments defined in $MATHENV will be replaced by $MATHREPL, and  environments in $MATHARRENV
#       will be replaced by their equivalent with a * appended, e.g. align -> align*
#    d. If in-line math mode contains array environment, enclose the whole environment in \mbox'es
#    d. place \cite commands in mbox'es (for UNDERLINE style)
#
#   For added blocks:
#    c. If in-line math mode contains array environment, enclose the whole environment in \mbox'es
#    d. place \cite commands in mbox'es (for UNDERLINE style)
#
# 2.   If math-mode COARSE,WHOLE or NONE option set: Convert \MATHBLOCKmath{..} commands back to environments
#
#      Convert all PICTUREblock{..} commands back to the appropriate environments
###0.5: Remove DIFadd, DIFdel, DIFaddbegin , ... from picture environments
# 3. Convert DIFadd, DIFdel, DIFaddbegin , ... into FL varieties
#    within floats (currently recognised float environments: plate,table,figure
#    plus starred varieties).
# 4. Remove empty %DIFDELCMD < lines
# 4. Convert \begin{SQUAREBRACKET} \end{SQUAREBRACKET} into \[ \]
#    Convert \begin{DOLLARDOLLAR} \end{DOLLARDOLLAR} into $$ $$
# 5. Convert  \SUPERSCRIPTNB{n} into ^n  and  \SUPERSCRIPT{nn} into ^{nnn}
# 6. Convert  \SUBSCRIPTNB{n} into _n  and  \SUBCRIPT{nn} into _{nnn}
# 7. Expand hashes of verb and verbatim environments
# 8. Convert '\PERCENTAGE ' back into '\%' and '\DOLLAR ' into '\$'
# 9.. remove all \PAR tokens
# 10.  package specific processing:  endfloat: make sure \begin{figure} and \end{figure} are always
#      on a line by themselves, similarly for table environment
#  4, undo renaming of the \begin, \end,{,}  in comments
#    Change \QLEFTBRACE, \QRIGHTBRACE,\AMPERSAND to \{,\},\&
#
# Note have to manually synchronize substitution commands below and
# DIF.. command names in the header
sub postprocess {
  my ( $begin,  $len,  $float,        $delblock, $addblock );     ### $cnt
                                                                  # second level blocks
  my ( $begin2, $len2, $eqarrayblock, $eqblock,  $mathblock );    ### $cnt2

  my ( @textparts, @newtextparts, @liststack, $listtype, $listlast );

  my ( @itemargs, $itemarg );

  for (@_) {
    # change $'s in comments to something harmless
    1 while s/(%.*)\$/$1DOLLARDIF/mg;

    # Remove final STOP token
    s/ STOP$//;
    # Replace \RIGHTBRACE in comments by \MBLOCKRIGHTBRACE
    # the only way to get these is as %DIFDELCMD < \RIGHTBRACE construction
    # This essentially marks closing right braces of MATHBLOCK environments, which did not get matched
    # up. This case should be rare, so I just leave this in the diff file output. Not really elegant
    # but can still be dealt with later if it results in problems.
    s/%DIFDELCMD < \\RIGHTBRACE/%DIFDELCMD < \\MBLOCKRIGHTBRACE/g;
    # Replace \RIGHTBRACE by }
    s/\\RIGHTBRACE/}/g;

    # Optional: Remove deleted block entirely
    if ($onlyadditions) {
      s/\\DIFdelbegin.*?\\DIFdelend//sg;
      #remove deleted comments
      s/%$DELCOMMENT.*\n//g;
    }

###    # change citation commands within comments to protect from processing
###    if ($CITECMD){
###      1 while s/(%.*)\\($CITECMD)/$1\\CITEDIF$2/m ;
###    }
    # Check all deleted blocks: where a deleted block contains a matching \begin and
    #    \end environment (these will be disabled by a %DIFDELCMD statements), enable
    #    these commands again (such that for example displayed math in a deleted equation
    #    is properly within math mode).  For math mode environments replace numbered equation
    #    environments with their display only variety (so that equation numbers in new file and
    #    diff file are identical)
    writedebugfile( $_, 'postprocess1' );

    while (m/\\DIFdelbegin.*?\\DIFdelend/sg) {
      # special processing within each deleted block
      ###    while ( m/\\DIFdelbegin.*?\\DIFdelend/sg ) {
      ###      print STDERR "DEBUG Match delblock \n||||$&||||\n at ",pos,"\n";
      my $arrenv;     # dummy variable only needed within this block
      my @symbols;    # another temporary variable
###      $cnt=0;
      $len      = length($&);
      $begin    = pos($_) - $len;
      $delblock = $&;
      ###   A much simpler method for math replacement might follow this strategy (can recycle part of the commands below for following
      ###   this strategy:
      ###   1. a Insert aux commands \begin{MATHMODE} or \end{MATHMODE} for all deleted commands opening or closing displayed math mode
      ###      b Insert aux commands \begin{MATHARRMODE} or \end{MATHARRMODE} for all deleted commands opening or closing math array mode
      ###   2  Replace MATHMODE and MATHARRMODE by correct pairing if appropriate partner  math command is found in text
      ###   3  a Replace remaining \begin{MATHMODE}...\end{MATHMODE} pairs with \begin{$MATHREPL}..\end{$MATHREPL}
      ###      b Replace remaining \begin{MATHARRMODE}...\end{MATHARRMODE} pairs with \begin{$MATHREPL}..\end{$MATHREPL}
      ###   4  Delete all aux command math mode pairs which have simply comments or empty lines between them
      ###   As written this won't actually work!

      ###   Most general case: allow all included environments
      ###      $delblock=~ s/(\%DIFDELCMD < \s*\\begin\{(\w*\*?)\}\s*?\n)(.*?)(\%DIFDELCMD < \s*\\end\{\2\})/$1\\begin{$2}$AUXCMD\n$3\n\\end{$2}$AUXCMD\n$4/sg;
      ### (.*?[^\n]?)\n? construct is necessary to avoid empty lines in math mode, which result in
      ### an error
      # displayed math environments
      ###0.5:     $delblock=~ s/(\%DIFDELCMD < \s*\\begin\{((?:$MATHENV)|SQUAREBRACKET)\}\s*?(?:$DELCMDCLOSE|\n))(.*?[^\n]?)\n?(\%DIFDELCMD < \s*\\end\{\2\})/\\begin{$MATHREPL}$AUXCMD\n$1$3\n\\end{$MATHREPL}$AUXCMD\n$4/sg;

      if ( $mathmarkup == FINE ) {
        # if block contains both beginning and and markers for an explicit math environment, restore opening and closing commands
        $delblock =~
          s/(\%DIFDELCMD < \s*\\begin\{((?:$MATHENV)|SQUAREBRACKET)\}.*?(?:$DELCMDCLOSE|\n))(.*?[^\n]?)\n?(\%DIFDELCMD < \s*\\end\{\2\})/\\begin{$MATHREPL}$AUXCMD\n$1$3\n\\end{$MATHREPL}$AUXCMD\n$4/sg;
        # also transform the opposite pair \end{displaymath} .. \begin{displaymath} but we have to be careful not to interfere with the results of the transformation in the line directly above
        ### pre-0.42 obsolete version which did not work on eqnarray test      $delblock=~ s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \s*\\end\{($MATHENV)\}\s*?\n)(.*?[^\n]?)\n?(?<!${AUXCMD}\n)(\%DIFDELCMD < \s*\\begin\{\2\})/$1\\end{$MATHREPL}$AUXCMD\n$3\n\\begin{$MATHREPL}$AUXCMD\n$4/sg;
        ###0.5:      $delblock=~ s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \s*\\end\{((?:$MATHENV)|SQUAREBRACKET)\}\s*?(?:$DELCMDCLOSE|\n))(.*?[^\n]?)\n?(?<!${AUXCMD}\n)(\%DIFDELCMD < \s*\\begin\{\2\})/\\end{MATHMODE}$AUXCMD\n$1$3\n\\begin{MATHMODE}$AUXCMD\n$4/sg;
        $delblock =~
          s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \h*\\end\{((?:$MATHENV)|SQUAREBRACKET)\}.*?(?:$DELCMDCLOSE|\n))(.*?[^\n]?)\n?(?<!${AUXCMD}\n)(\%DIFDELCMD < \h*\\begin\{\2\})/\\end\{MATHMODE\}$AUXCMD\n$1$3\n\\begin\{MATHMODE\}$AUXCMD\n$4/sg;

        # now look for unpaired %DIFDELCMD < \begin{MATHENV}; if found add \begin{$MATHREPL} and insert \end{$MATHREPL}
        # just before end of block; again we use look-behind assertion to avoid matching constructions which have already been converted
        if ( $delblock =~
          s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \h*\\begin\{((?:$MATHENV)|SQUAREBRACKET)\}\s*?(?:$DELCMDCLOSE|\n))/$1\\begin{$MATHREPL}$AUXCMD\n/sg
          )
        {
          ### print STDERR "BINGO: begin block: \nBefore: |" . substr($_,$begin,$len) . "|\n" if $debug ;
          $delblock =~ s/(\\DIFdelend$)/\\end{$MATHREPL}$AUXCMD\n$1/s;
          ### print STDERR "After: |" . $delblock . "|\n\n" if $debug ;
        }
        # now look for unpaired %DIFDELCMD < \end{MATHENV}; if found add \end{MATHMODE} and insert \begin{MATHMODE}
        # just before end of block; again we use look-behind assertion to avoid matching constructions which have already been converted
        if ( $delblock =~
          s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \h*\\end\{((?:$MATHENV)|SQUAREBRACKET)\}\s*?(?:$DELCMDCLOSE|\n))/$1\\end\{MATHMODE\}$AUXCMD\n/sg
          )
        {
          ### print STDERR "BINGO: end block:\nBefore: |" . substr($_,$begin,$len) . "|\n" if $debug;
          $delblock =~ s/(\\DIFdelend$)/\\begin\{MATHMODE\}$AUXCMD\n$1/s;
          ### print STDERR "After: |" . $delblock . "|\n\n" if $debug ;
        }

        ### pre-0.42      # same as above for special case \[.\] (latex abbreviation for displaymath)
        ### pre-0.42      $delblock=~ s/(\%DIFDELCMD < \s*\\\[\s*?\n())(.*?[^\n]?)\n?(\%DIFDELCMD < \s*\\\])/$1\\\[$AUXCMD\n$3\n\\\]$AUXCMD\n$4/sg;
        ### pre-0.42      $delblock=~ s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \s*\\\]\s*?\n())(.*?[^\n]?)\n?(?<!${AUXCMD}\n)(\%DIFDELCMD < \s*\\\[)/$1\\\]$AUXCMD\n$3\n\\\[$AUXCMD\n$4/sg;
        # equation array environment
        ###pre-0.3      $delblock=~ s/(\%DIFDELCMD < \s*\\begin\{($MATHARRENV)\}\s*?\n)(.*?)(\%DIFDELCMD < \s*\\end\{\2\})/$1\\begin{$MATHARRREPL}$AUXCMD\n$3\n\\end{$MATHARRREPL}$AUXCMD\n$4/sg;
        ###0.5      $delblock=~ s/(\%DIFDELCMD < \s*\\begin\{($MATHARRENV)\}\s*?(?:$DELCMDCLOSE|\n))(.*?[^\n]?)\n?(\%DIFDELCMD < \s*\\end\{\2\})/\\begin{$MATHARRREPL}$AUXCMD\n$1$3\n\\end{$MATHARRREPL}$AUXCMD\n$4/sg;
        ###1.3.2         $delblock=~ s/(\%DIFDELCMD < \s*\\begin\{($MATHARRENV)\}.*?(?:$DELCMDCLOSE|\n))(.*?[^\n]?)\n?(\%DIFDELCMD < \s*\\end\{\2\})/\\begin{$MATHARRREPL}$AUXCMD\n$1$3\n\\end{$MATHARRREPL}$AUXCMD\n$4/sg;
        # Example Input: %DIFDELCMD < \begin{alignat}{2} \n\exp(ix)&=&\cos(x)+i\sin(x)\n%DIFDECMD < \end{alignat}
        #                < $1                <$2   >><$3>  < $4                      ><$5                       >
        # Example Output:\begin{alignat*}{2}%DIFAUXCMD\n\%DIFDELCMD\begin{align}\n\exp(ix)&=&\cos(x)+i\sin(x)\n\end{align*}%DIFAUXCMD\n%DIFDELCMD > \end{alignat*}
        $delblock =~
          s/(\%DIFDELCMD < \s*\\begin\{($MATHARRENV)\}(.*?)(?:$DELCMDCLOSE|\n))(.*?[^\n]?)\n?(\%DIFDELCMD < \s*\\end\{\2\})/\\begin{$2*}$3$AUXCMD\n$1$4\n\\end{$2*}$AUXCMD\n$5/sg;
        ###  pre-0.42 obsolete version which did not work on eqnarray test     $delblock=~ s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \s*\\end\{($MATHARRENV)\}\s*?\n)(.*?[^\n]?)\n?(?<!${AUXCMD}\n)(\%DIFDELCMD < \s*\\begin\{\2\})/$1\\end{$MATHARRREPL}$AUXCMD\n$3\n\\begin{$MATHARRREPL}$AUXCMD\n$4/sg;
        $delblock =~
          s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \h*\\end\{($MATHARRENV)\}\s*?(?:$DELCMDCLOSE|\n))(.*?[^\n]?)\n?(?<!${AUXCMD}\n)(\%DIFDELCMD < \h*\\begin\{\2\})/\\end{MATHMODE}$AUXCMD\n$1$3\n\\begin{MATHMODE}$AUXCMD\n$4/sg;
        ### print STDERR "STEP1: |" . $delblock . "|\n\n" if $debug ;

        # now look for unpaired %DIFDELCMD < \begin{MATHARRENV}; if found add \begin{$MATHARRREPL} and insert \end{$MATHARRREPL}
        # just before end of block; again we use look-behind assertion to avoid matching constructions which have already been converted
        if ( $delblock =~
          s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \h*\\begin\{($MATHARRENV)\}(.*?)(?:$DELCMDCLOSE|\n))/$1\\begin{$2*}$3$AUXCMD\n/sg
          )
        {
          $arrenv = $2;
          $delblock =~ s/(\\DIFdelend$)/\\end{$arrenv*}$AUXCMD\n$1/s;
        }
        ### print STDERR "STEP2: |" . $delblock . "|\n\n" if $debug ;

        # now look for unpaired %DIFDELCMD < \end{MATHENV}; if found add \end{MATHMODE} and insert \begin{MATHMODE}
        # just before end of block; again we use look-behind assertion to avoid matching constructions which have already been converted
        if ( $delblock =~
          s/(?<!${AUXCMD}\n)(\%DIFDELCMD < \h*\\end\{($MATHARRENV)\}\s*?(?:$DELCMDCLOSE|\n))/$1\\end{MATHMODE}$AUXCMD\n/sg
          )
        {
          $delblock =~ s/(\\DIFdelend$)/\\begin{MATHMODE}$AUXCMD\n$1/s;
        }

        # parse $delblock for deleted and reinstated eqnarray* environments - within those reinstate \\ and & commands
        ###      while ( $delblock =~ m/\\begin{$MATHARRREPL}$AUXCMD\n.*?\n\\end{$MATHARRREPL}$AUXCMD\n/sg ) {
        ### while ( $delblock =~ m/\\begin\Q{$MATHARRREPL}$AUXCMD\E\n.*?\n\\end\Q{$MATHARRREPL}$AUXCMD\E\n/sg ) {
        while ( $delblock =~ m/\\begin\{$MATHARRENV\*}[^\n]*?$AUXCMD\n.*?\n\\end\{$MATHARRENV\*\}$AUXCMD\n/sg ) {
          ###	      print STDERR "DEBUG Match eqarrayblock $& at ",pos,"\n";
###	  $cnt2=0;
          $len2         = length($&);
          $begin2       = pos($delblock) - $len2;
          $eqarrayblock = $&;
          # reinstate deleted & and \\ commands
          ### $eqarrayblock=~ s/(\%DIFDELCMD < \s*(\&|\\\\)\s*?(?:$DELCMDCLOSE|\n))/$1$2$AUXCMD\n/sg ;
          $eqarrayblock =~ s/(\%DIFDELCMD < (.*?(?:\&|\\\\).*)(?:$DELCMDCLOSE|\n))/
        	  # The pattern captures comments with at least one of & or \\
                  @symbols= split(m@((?:&|\\\\)\s*)@,$2);   #  extract & and \\ and other material from sequence
                  @symbols= grep ( m@&|\\\\\s*@, @symbols); #  select & and \\ (and subsequent spaces)
                  "$1@symbols$AUXCMD\n"
            /eg;
          ### print STDERR "Modified block:|$eqarrayblock|\n" if  $debug;
          # splice in modified block
          substr( $delblock, $begin2, $len2 ) = $eqarrayblock;
          pos($delblock) = $begin2 + length($eqarrayblock);
        }

      } elsif ( $mathmarkup == COARSE || $mathmarkup == WHOLE ) {
        #       Convert MATHBLOCKmath commands to their uncounted numbers (e.g. convert equation -> displaymath
        #       (environments defined in $MATHENV will be replaced by $MATHREPL, and  environments in $MATHARRENV
        #       will be replaced by their starred variety
        $delblock =~ s/\\MATHBLOCK($MATHENV)((?:\[$brat_n\])?)\{($pat_n)\}/\\MATHBLOCK$MATHREPL$2\{$3\}/sg;
        $delblock =~ s/\\MATHBLOCK($MATHARRENV)((?:\[$brat_n\])?)\{($pat_n)\}/\\MATHBLOCK$1\*$2\{$3\}/sg;
      }

      # Replacing math array environments with their starred varieties in deleted blocks as implemented now causes double asterisks
      # in situation where there had been starred already, e.g. \begin{alignat*} is turned into \begin{alignat**}
      # The following command seeks to undo this double-starring. It is a little bit of a hack because it relies on the fact that **
      # double-starred math array environment does not occur naturally
      $delblock =~ s/($MATHARRENV)(?<=\*)\*/$1/sg;

      print STDERR "DELBLOCK after maths processing: |" . $delblock . "|\n\n" if $debug;

      # Reinstate completely deleted list environments. note that items within the
      # environment will still be commented out.  They will be restored later
      $delblock =~
        s/(\%DIFDELCMD < \s*\\begin\{($LISTENV)\}\s*?(?:\n|$DELCMDCLOSE))(.*?)(\%DIFDELCMD < \s*\\end\{\2\})/{
															###   # block within the search; replacement environment
															###   "$1\\begin{$2}$AUXCMD\n". restore_item_commands($3). "\n\\end{$2}$AUXCMD\n$4";
															"$1\\begin{$2}$AUXCMD\n$3\n\\end{$2}$AUXCMD\n$4";
														       }/esg;
      ###      $delblock=~ s/\\begin\{$MATHENV}$AUXCMD/\\begin{$MATHREPL}$AUXCMD/g;
      ###      $delblock=~ s/\\end\{$MATHENV}$AUXCMD/\\end{$MATHREPL}$AUXCMD/g;
      ###      $delblock=~ s/\\begin\{$MATHARRENV}$AUXCMD/\\begin{$MATHARRREPL}$AUXCMD/g;
      ###      $delblock=~ s/\\end\{$MATHARRENV}$AUXCMD/\\end{$MATHARRREPL}$AUXCMD/g;

      #    b.where one of the commands matching $COUNTERCMD is used as a DIFAUXCMD, add a statement
      #      subtracting one from the respective counter to keep numbering consistent with new file
      $delblock =~
        s/\\($COUNTERCMD)((?:${extraspace}\[$brat_n\]${extraspace}|${extraspace}\{$pat_n\})*\s*${AUXCMD}\n)/\\$1$2\\addtocounter{$1}{-1}${AUXCMD}\n/sg;

      #    bb. disable active labels within deleted blocks (i.e. those not commented out) (as these are not safe commands, this should normally only
      #        happen within deleted maths blocks
      ###      $delblock=~ s/(?<!$DELCMDOPEN)(\\$LABELCMD(?:${extraspace})\{(?:[^{}])*\}[\t ]*)\n?/${DELCMDOPEN}$1${DELCMDCLOSE}/smg ;
      ###      previous line caused trouble as by issue #90 I might need to modify this
      $delblock =~ s/^([^%]*)(\\$LABELCMD(?:${extraspace})\{(?:[^{}])*\}[\t ]*)\n?/$1${DELCMDOPEN}$2${DELCMDCLOSE}/smg;
      ###      print STDERR "<<<$delblock>>>\n" if $debug;

      #     c. If in-line math mode contains array environment, enclose the whole environment in \mbox'es
      while ( $delblock =~ m/($math)(\s*)/sg ) {
##		      print STDERR "DEBUG Delblock Match math $& at ",pos,"\n";
###	$cnt2=0;
        $len2      = length($&);
        $begin2    = pos($delblock) - $len2;
        $mathblock = "%\n\\mbox{$AUXCMD\n$1\n}$AUXCMD\n";
        next unless ( $mathblock =~ /ARRAYBLOCK/ or $mathblock =~ m/\{$ARRENV\}/ );
        substr( $delblock, $begin2, $len2 ) = $mathblock;
        pos($delblock) = $begin2 + length($mathblock);
      }
      ###      if ($CITE2CMD) {
      ######   ${extraspace}(?:\[$brat0\]${extraspace}){0,2}\{$pat_n\}))  .*?%%%\n
      ###	$delblock=~s/($DELCMDOPEN\s*\\($CITE2CMD)(.*)$DELCMDCLOSE)/
      ###	  # Replacement code
      ###	  {my ($aux,$all);
      ###	   $aux=$all=$1;
      ###	   $aux=~s#\n?($DELCMDOPEN|$DELCMDCLOSE)##g;
      ###	   $all."$aux$AUXCMD\n";}/sge;
      ###      }
      ###      # or protect \cite commands with \mbox
      ###      if ($CITECMD) {
      ######	$delblock=~s/(\\($CITECMD)${extraspace}(?:\[$brat0\]${extraspace}){0,2}\{$pat_n\})(\s*)/\\mbox{$AUXCMD\n$1\n}$AUXCMD\n/msg ;
      ###	$delblock=~s/(\\($CITECMD)${extraspace}(?:<$abrat0>${extraspace})?(?:\[$brat0\]${extraspace}){0,2}\{$pat_n\})(\s*)/\\mbox{$AUXCMD\n$1\n}$AUXCMD\n/msg ;
      ###      }
      # if MBOXINLINEMATH is set, protect inlined math environments with an extra mbox

      if ($MBOXINLINEMATH) {
        # note additional \newline after command is omitted from output if right at the end of deleted block (otherwise a spurious empty line is generated)
        $delblock =~ s/($math)(?:[\s\n]*)?/\\mbox{$AUXCMD\n$1\n}$AUXCMD\n/sg;
      }
      ###if ( defined($packages{"listings"} and $latexdiffpreamble =~ /\\RequirePackage(?:\[$brat_n\])?\{color\}/))   {
      ###  #     change included verbatim environments
      ###  $delblock =~ s/\\DIFverb\{/\\DIFDIFdelverb\{/g;
      ###  $delblock =~ s/\\DIFlstinline/\\DIFDIFdellstinline/g;
      ###}
      # Mark deleted verbatim commands
      $delblock =~
        s/(${DELCMDOPEN}\\DIF((?:verb\*?|lstinline(?:\[$brat_n\])?)\{([-\d]*?)\}\s*).*)$/%\n\\DIFDIFdel$2${AUXCMD}\n$1/gm;
      if ($CUSTOMDIFCMD) {
        ###$delblock =~ s/(${DELCMDOPEN}.*)\\($CUSTOMDIFCMD)((?:\[${brat_n}\])*?(?:\s*\{${pat_n}\})*)/"$1${DELCMDCLOSE}\\DEL$2". stripdelcmdopen($3) ." ${DELCMDOPEN}"/egms;
        ###$delblock =~ s/(${DELCMDOPEN}.*)\\($CUSTOMDIFCMD)/$1${DELCMDCLOSE}\\DEL$2/gm;
        # ($1 ? "${DELCMDOPEN}$1${DELCMDCLOSE}":"") : only add the DELCMDOPEN / DELCMDCLOSE pair if there are actually any commands in between, otherwise this is redundant
        $delblock =~
          s/${DELCMDOPEN}(.*?)\\($CUSTOMDIFCMD)((?:\[${brat_n}\])*?(?:\s*\{${pat_n}\})*)/($1 ? "${DELCMDOPEN}$1${DELCMDCLOSE}":"") ."\\DEL$2". stripdelcmdopen($3)/egs;
        # if there is a sequence of several commands in the same row only the first will be converted due to the need to be connected to the DELCMDOPEN. To mop these up, just add the DEL to the front of any remaining cmd's in the deleted block
        $delblock =~ s/\\($CUSTOMDIFCMD)/\\DEL$1/g; # this will also convert comments but I guess it does not matter much
      }

      #     splice in modified delblock
      substr( $_, $begin, $len ) = $delblock;
      pos = $begin + length($delblock);
    }

    ### print STDERR "<<<$_>>>\n" if $debug;

    # make the array modification in added blocks
    while (m/\\DIFaddbegin.*?\\DIFaddend/sg) {
###      $cnt=0;
      $len      = length($&);
      $begin    = pos($_) - $len;
      $addblock = $&;
      while ( $addblock =~ m/($math)(\s*)/sg ) {
###	print STDERR "DEBUG Addblock Match math |$1| (head:NA tail |$2| at ",pos,"\n";
###	$cnt2=0;
        $len2      = length($&);
        $begin2    = pos($addblock) - $len2;
        $mathblock = "%\n\\mbox{$AUXCMD\n$1\n}$AUXCMD\n";
        next unless ( $mathblock =~ /ARRAYBLOCK/ or $mathblock =~ m/\{$ARRENV\}/ );
        substr( $addblock, $begin2, $len2 ) = $mathblock;
        pos($addblock) = $begin2 + length($mathblock);
      }
###      if ($CITECMD) {
###	my $addblockbefore=$addblock;
######	$addblock=~ s/(\\($CITECMD)${extraspace}(?:\[$brat0\]${extraspace}){0,2}\{$pat2\})(\s*)/\\mbox{$AUXCMD\n$1\n}$AUXCMD\n/msg ;
###	#(?:mask)?(?:full|short|no)?cite(?:A|author|year|meta)(?:NP)?$/
###	###my $CITECMD; $CITECMD="cite(?:A)$";
###	$addblock=~ s/(\\($CITECMD)${extraspace}(?:<$abrat0>${extraspace})?(?:\[$brat0\]${extraspace}){0,2}\{$pat2\})(\s*)/\\mbox{$AUXCMD\n$1\n}$AUXCMD\n/msg ;
###	print STDERR "DEBUG: CITECMD $CITECMD\nDEBUG: addblock before:|$addblockbefore|\n" if $debug;
###	print STDERR "DEBUG: addblock after: |$addblock|\n" if $debug;
###      }
      # if MBOXINLINEMATH is set, protect inlined math environments with an extra mbox
      if ($MBOXINLINEMATH) {
        ##$addblock=~s/($math)/\\mbox{$AUXCMD\n$1\n}$AUXCMD\n/sg;
        $addblock =~ s/($math)(?:[\s\n]*)?/\\mbox{$AUXCMD\n$1\n}$AUXCMD\n/sg;
      }
      ###if ( defined($packages{"listings"} and $latexdiffpreamble =~ /\\RequirePackage(?:\[$brat0\])?\{color\}/))   {
      # mark added verbatim commands
      $addblock =~ s/\\DIFverb/\\DIFDIFaddverb/g;
      $addblock =~ s/\\DIFlstinline/\\DIFDIFaddlstinline/g;
      if ($CUSTOMDIFCMD) {
        $addblock =~ s/\\($CUSTOMDIFCMD)/\\ADD$1/g; # this will also convert comments but I guess it does not matter much
      }
      # markup the optional arguments of \item
      $addblock =~ s/(\\$ITEMCMD$extraspace(?:<$abrat0>)?$extraspace)\[($brat_n)\]/
	@itemargs=splitlatex(substr($2,0,length($2)));
        $itemarg="[".join("",marktags("","",$ADDOPEN,$ADDCLOSE,"","",$ADDCOMMENT,\@itemargs))."]";
      "$1$itemarg"/sge;                             # old substitution: $1\[$ADDOPEN$2$ADDCLOSE\]
      ###}
      #     splice in modified addblock
      substr( $_, $begin, $len ) = $addblock;
      pos = $begin + length($addblock);
    }

    # Go through whole text, and by counting list environment commands, find out when we are within a list environment.
    # Within those restore deleted \item commands
    @textparts    = split /(?<!$DELCMDOPEN)(\\(?:begin|end)\{$LISTENV\})/;
    @liststack    = ();
    @newtextparts = map {
      ### print STDERR ":::::::: $_\n";
      if ( ($listtype) = m/^\\begin\{($LISTENV)\}$/ ) {
        print STDERR "DEBUG: postprocess \\begin{$listtype}\n" if $debug;
        push @liststack, $listtype;
      } elsif ( ($listtype) = m/^\\end\{($LISTENV)\}$/ ) {
        print STDERR "DEBUG: postprocess \\end{$listtype}\n" if $debug;
        if ( scalar @liststack > 0 ) {
          $listlast = pop(@liststack);
          ( $listtype eq $listlast )
            or warn "Invalid nesting of list environments: $listlast environment closed by \\end{$listtype}.";
        } else {
          warn
            "WARNING: Invalid nesting of list environments: \\end{$listtype} encountered without matching \\begin{$listtype}.\n";
        }
      } else {
        print STDERR "DEBUG: postprocess \@liststack=(", join( ",", @liststack ), ")\n" if $debug;
        if ( scalar @liststack > 0 ) {
          # we are within a list environment and should replace all item commands
          $_ = restore_item_commands($_);
        }
        # else: we are outside a list environment and do not need to do anything
      }
      $_
    } @textparts;    # end of map command
                     # replace the main text with the modified version
    $_ = join( "", @newtextparts );
###    print STDERR "DEBUG: \@newtextparts=",join("@@@@@",@newtextparts);

### pre-1.0.4:
###    ### old place for BEGINDIF, ENDDIF replacement
###    # change begin and end commands  within comments such that they
###    # don't disturb the pattern matching (if there are several \begin or \end in one line
###    # this substitution is insufficient but that appears unlikely)
###    s/(%.*)\\begin\{(.*)$/$1\\BEGINDIF\{$2/mg ;
###    s/(%.*)\\end\{(.*)$/$1\\ENDDIF\{$2/mg ;

###    # replace {,} in comments with \\CLEFTBRACED,\\CRIGHTBRACED
###    # This needs to be repeated here to also get rid of DIFdelcmd-protected environments
###    # note CLEFTBRACED used here vs CLEFTBRACE in initial conversion
###    # note that this turned out to be a bad idea as it interfered with some other reverse changes assuming the bracket
###    1 while s/(%.*)\{(.*)$/$1\\CLEFTBRACED $2/mg ;
###    1 while s/(%.*)\}(.*)$/$1\\CRIGHTBRACED $2/mg ;

    # Replace MATHMODE environments from step 1a above by the correct Math environment and remove unncessary pairings

###    print STDERR "DEBUG: before mathmode replacement\n $_ ------------ \n";
    if ( $mathmarkup == FINE ) {
      # look for AUXCMD math-mode pairs which have only comments (or empty lines between them), and remove the added commands
      # \begin{..} ... \end{..} pairs
      s/\\begin\{((?:$MATHENV)|(?:$MATHARRENV)|SQUAREBRACKET|MATHMODE)\}$AUXCMD\n((?:\s*%.[^\n]*\n)*)\\end\{\1\}$AUXCMD\n/$2/sg;
      # \end{..} .... \begin{..} pairs
      s/\\end\{((?:$MATHENV)|(?:$MATHARRENV)|SQUAREBRACKET|MATHMODE)\}$AUXCMD\n((?:\s*%.[^\n]*\n)*)\\begin\{\1\}$AUXCMD\n/$2/sg;

      writedebugfile( $_, 'postprocess15' );
      # The next line is complicated.  The negative look-ahead insertion makes sure that no \end{$MATHENV} (or other mathematical
      # environments) are between the \begin{$MATHENV} and \end{MATHMODE} commands. This is necessary as the minimal matching
      # is not globally minimal but only 'locally' (matching is beginning from the left side of the string)
      # [NB: Do not be tempted to prettify the expression with /x modified. It seems this is applied after strings are expanded so will ignore spaces in strings
      1 while
        s/(?<!$DELCMDOPEN)\\begin\{((?:$MATHENV)|(?:$MATHARRENV)|SQUAREBRACKET)}((?:${DELCMDOPEN}[^\n]*|.(?!(?:\\end\{(?:(?:$MATHENV)|(?:$MATHARRENV)|SQUAREBRACKET)}|\\begin\{MATHMODE})))*?)\\end\{MATHMODE}/\\begin{$1}$2\\end{$1}/s;
      writedebugfile( $_, 'postprocess16' );
      1 while
        s/\\begin\{MATHMODE}((?:.(?!\\end\{MATHMODE}))*?)(?<!$DELCMDOPEN)\\end\{((?:$MATHENV)|(?:$MATHARRENV)|SQUAREBRACKET)}/\\begin{$2}$1\\end{$2}/s;
      # convert remaining \begin{MATHMODE} \end{MATHMODE} (and not containing & or \\ )into MATHREPL environments
      s/\\begin\{MATHMODE\}((?:(.(?!(?<!\\)\&|\\\\))*)?)\\end\{MATHMODE\}/\\begin{$MATHREPL}$1\\end{$MATHREPL}/sg;
      # others into MATHARRREPL
      s/\\begin\{MATHMODE\}(.*?)\\end\{MATHMODE\}/\\begin{$MATHARRREPL}$1\\end{$MATHARRREPL}/sg;
      # Final cleanup of all equation environments: Sometimes I end up with %DIFDELCMD < \PAR lines, which I need to make sure do not get expanded into
      # actual empty lines within equation environments (later part)
      while (m/\\begin\{((?:$MATHENV|$MATHARRENV|SQUAREBRACKET)\*?)}.*?(?<!\%DIFDELCMD < )\\end\{\1}/sg) {
        $len     = length($&);
        $begin   = pos($_) - $len;
        $eqblock = $&;
        $eqblock =~ s/(%DIFDELCMD < )([^\n]*?)\\PAR\n/$1$2\n$1\n/sg;
        #     splice in modified delblock
        print STDERR "DEBUG EQBLOCK: |$eqblock|\n\n" if $debug;
        substr( $_, $begin, $len ) = $eqblock;
        pos = $begin + length($eqblock);
      }
    } else {
      #   math modes OFF,WHOLE,COARSE: Convert \MATHBLOCKmath{..} commands back to environments
      # with optionl argument to MATHBLOCK, e.g \MATHBLOCKalignat[{3}]{ ...}
      s/\\MATHBLOCK($MATHENV|$MATHARRENV\*?|SQUAREBRACKET)\[($brat0)\]\{($pat_n)\}/\\begin{$1}$2$3\\end{$1}/sg;
      # without optional argument e.g \MATHBLOCKalign{ ...}
      s/\\MATHBLOCK($MATHENV|$MATHARRENV\*?|SQUAREBRACKET)\{($pat_n)\}/\\begin{$1}$2\\end{$1}/sg;
      # convert ARRAYBLOCK.. commands back to environments  (1 while construct allows nesting)
      1 while s/\\ARRAYBLOCK($ARRENV)\{($pat_n)\}/\\begin{$1}$2\\end{$1}/sg;
      # get rid of the DIFANCHOR markers, first the delete comments, then everywhere
      s/%DIFDELCMD < \\DIFANCHOR(?:MATH|ARR)[BE] (?:\n%DIFDELCMD < )?%%%\n//g;
      s/\\DIFANCHOR(?:MATH|ARR)[BE] //g;
    }
    writedebugfile( $_, 'postprocess2' );

    #  Convert all PICTUREblock{..} commands back to the appropriate environments
    s/\\PICTUREBLOCK($PICTUREENV)\{($pat_n)\}/\\begin{$1}$2\\end{$1}/sg;
    #0.5:    # Remove all mark up within picture environments
    #     while ( m/\\begin\{($PICTUREENV)\}.*?\\end\{\1\}/sg ) {
    #       $cnt=0;
    #       $len=length($&);
    #       $begin=pos($_) - $len;
    #       $float=$&;
    #       $float =~ s/\\DIFaddbegin //g;
    #       $float =~ s/\\DIFaddend //g;
    #       $float =~ s/\\DIFadd\{($pat_n)\}/$1/g;
    #       $float =~ s/\\DIFdelbegin //g;
    #       $float =~ s/\\DIFdelend //g;
    #       $float =~ s/\\DIFdel\{($pat_n)\}//g;
    #       $float =~ s/$DELCMDOPEN.*//g;
    #       substr($_,$begin,$len)=$float;
    #       pos = $begin + length($float);
    #     }
    # Convert DIFadd, DIFdel, DIFFaddbegin , ... into  varieties
    #    within floats (currently recognised float environments: plate,table,figure
    #    plus starred varieties).
### explict negative lookahear    while ( m/(?<!%DIFDELCMD < )\\begin\{($FLOATENV)\}.*?(?<!%DIFDELCMD < )\\end\{\1\}/sg ) {
    while (m/\\begin\{($FLOATENV)\}.*?\\end\{\1\}/sg) {
###      print STDERR "DEBUGL MatchFloat  $& at ",pos,"\n";
###      $cnt=0;
      $len   = length($&);
      $begin = pos($_) - $len;
      $float = $&;
      $float =~ s/\\DIFaddbegin /\\DIFaddbeginFL /g;
      $float =~ s/\\DIFaddend /\\DIFaddendFL /g;
      $float =~ s/\\DIFadd\{/\\DIFaddFL{/g;
      $float =~ s/\\DIFdelbegin /\\DIFdelbeginFL /g;
      $float =~ s/\\DIFdelend /\\DIFdelendFL /g;
      $float =~ s/\\DIFdel\{/\\DIFdelFL{/g;
      substr( $_, $begin, $len ) = $float;
      pos = $begin + length($float);
    }
    ### former location of undo renaming of \begin and \end in comments

    # remove empty DIFCMD < lines
    s/^\Q${DELCMDOPEN}\E\n//msg;

    # Look for paired \DIFdel{word} and \DIFadd{anotherword} commands and 
    # check if a letter level diff is preferable

    #while ( m/\\DIFdelbegin \\DIFdel\{(${word})\}\\DIFdelend \\DIFaddbegin \\DIFadd\{(${word})\}\\DIFaddend/g) {
    while ( m/\\DIFdelbegin \\DIFdel\{($word\s*)\}\\DIFdelend \\DIFaddbegin \\DIFadd\{(${word}\s*)\}\\DIFaddend/g) {      
      $len = length($&);
      $begin = pos($_) - $len;
      my @oldletters = split( //, $1);
      my @newletters = split( //, $2);
      my @lettersdiff = pass2( \@oldletters, \@newletters );
      ###print STDERR "DEBUG: Word detection. Found \\DIFdel{$1}\\DIFadd{$2} at ",pos,". Replaced with ".join("",@lettersdiff) . "\n" ;
      ###print STDERR "Grep count: ", (scalar grep { $_ =~ /\\DIF(del|add)begin/} @lettersdiff),"\n";
      if ( ( grep { $_ =~ /\\DIF(del|add)begin/} @lettersdiff ) <= $MAXCHANGESLETTER ) {
        # only make the change if there are at most 2 changes (up to 2 additions or deletions, or one substitution)
        my $repl = join("",@lettersdiff);
        # if the string ends with spaces, then add '{}' after the last command to ensure there are not ignored
        $repl =~ s/(?<=\\DIF(?:add|del)end) (\s+)$/\{\}$1/sg;
        ###print STDERR "DEBUG: Replacing with |$repl|\n";
        substr( $_, $begin, $len ) = $repl ;
        pos = $begin + length($repl);
      }
    }
    # Expand hashes of verb and verbatim environments
    s/${DELCMDOPEN}\\($VERBATIMENV)\{([-\d]*?)\}/"${DELCMDOPEN}\\begin{${1}}".fromhash(\%verbhash,$2,$DELCMDOPEN)."${DELCMDOPEN}\\end{${1}}"/esg;
    # revert changes to verbatim environments for line diffs (and add code to mark up changes) (note negative look behind assertions to not leak out of DIFDELCMD comments)
    # Example:
    # < \begin{verbatim}
    # < %DIF < DIFVRB old verbatim line
    # < %DIF > DIFVRB new verbatim line
    # < \end{verbatim}
    # ---
    # > \DIFmodbegin
    # > \begin{verbatim}[alsolanguage=DIFcode]
    # > %DIF < old verbatim line
    # > %DIF > new verbatim line
    # > \end{verbatim}
    # > \DIFmodend
    s/(?<!$DELCMDOPEN)\\begin\{($VERBATIMLINEENV)\}(.*?)(?<!$DELCMDOPEN)\\end\{\1\}/"". reverselinecomment($1, $2) .""/esg;
    #    # we do the same for deleted environments but additionally reinstate the framing commands
    #   s/$DELCMDOPEN\\begin\{($VERBATIMLINEENV)\}$extraspace(?:\[$brat0\])?$DELCMDCLOSE(.*?)$DELCMDOPEN\\end\{\1\}$DELCMDCLOSE/"\\begin{$1}". reverselinecomment($2) . "\\end{$1}"/esg;
##    s/$DELCMDOPEN\\begin\{($VERBATIMLINEENV)\}($extraspace(?:\[$brat0\])?\s*)(?:\n|$DELCMDOPEN)*$DELCMDCLOSE((?:\%$DELCOMMENT$VERBCOMMENT.*?\n)*)($DELCMDOPEN\\end\{\1\}(?:\n|\s|$DELCMDOPEN)*$DELCMDCLOSE)/"SUBSTITUTION: \\begin{$1}$2 INTERIOR: |$3| END: |$4|"/esg;
    s/ # Deleted \begin command of verbatim environment (Captures $1: whole deleted command, $2: environment, $3: optional arguments with white space
          (\Q$DELCMDOPEN\E\\begin\{($VERBATIMLINEENV)\}(\Q$extraspace\E(?:\[$brat_n\])?\s*)(?:\n|\Q$DELCMDOPEN\E)*\Q$DELCMDCLOSE\E)
        # Interior of deleted verbatim environment should consist entirely of delete DIFVRB comments, i.e. match only lines beginning with % DIF < DIFVRB
        #   Captures: $4: all lines combined
          ((?:\%\Q$DELCOMMENT$VERBCOMMENT\E[^\n]*?\n)*)
        # Deleted \end command of verbatim environment. Note that the type is forced to match the opening. Captures: $5: Whole deleted environment  (previous way this line was written: (\Q$DELCMDOPEN\E\\end\{\2\}(?:\n|\s|\Q$DELCMDOPEN\E)*\Q$DELCMDCLOSE\E)
          (\Q$DELCMDOPEN\E\\end\{\2\})
      / # Substitution part
            $1                   # Leave expression as is
            . "$AUXCMD NEXT\n"   # Mark the following line as an auxiliary command
            . ""    # reinstate the original environment without options
            . reverselinecomment($2, "$3$4")   # modify the body to change the markup; reverselinecomment parses for options
            . " $AUXCMD\n"  # close the auxiliary environment
            . $5               # and again leave the original deleted closing environment as is
      /esgx;    # Modifiers of substitution command
###    s/\Q$DELCMDOPEN\E\\begin\{($VERBATIMLINEENV)\}/"SUBSTITUTION"/esgx;
    writedebugfile( $_, 'postprocess2' );
    # where changes have occurred in verbatim environment, change verbatim to DIFverbatim to allow mark-up
    # (I use the presence of optional paramater to verbatim environment as the marker - normal verbatim
    # environment does not take optional arguments)
    s/(?<!$DELCMDOPEN)\\begin\{(verbatim[*]?)\}(\[$brat_n\].*?)\\end\{\1\}/\\begin{DIF$1}$2\\end{DIF$1}/sg;

    s/\\($VERBATIMENV)\{([-\d]*?)\}/"\\begin{${1}}".fromhash(\%verbhash,$2)."\\end{${1}}"/esg;

    # remove all \PAR tokens (taking care to properly keep commented out PAR's
    # from introducing uncommented newlines - next line)
    s/(%DIF < )([^\n]*?)\\PAR\n/$1$2\n$1\n/sg;
###    s/\\PAR\n/\n\n/sg;
    # convert PAR commands which are on a line by themselves
    s/\n(\s*?)\\PAR\n/\n\n/sg;
    # convert remaining PAR commands (which are preceded by non-white space characters, usually "}" ($ADDCLOSE)
    s/\\PAR\n/\n\n/sg;

    #  package specific processing:
###    print STDERR keys %packages;
    if ( defined( $packages{"endfloat"} ) ) {
      #endfloat: make sure \begin{figure} and \end{figure} are always
      #      on a line by themselves, similarly for table environment
      print STDERR "endfloat package detected.\n" if $verbose;
      # eliminate whitespace before and after
      s/^(\s*)(\\(?:end|begin)\{(?:figure|table)\})(\s*?)$/$2/mg;
      # split lines with remaining characters before float environment conmmand
      s/^([^%]+)(\\(?:begin|end)\{(?:figure|table)\})/$1\n$2/mg;
      # split lines with remaining characters after float environment conmmand
      s/^((?:[^%]+)\\(?:begin|end)\{(?:figure|table)\}(?:\[[a-zA-Z]+\])?)(.+)((?:%.*)?)$/$1\n$2$3/mg;
    }

    # Remove empty auxiliary LISTENV  (sometmes these are generated if list environment occurs within the argument of a deleted comment)
    #   (slightly hacky but I could not see an easy way to see if in argument of another command when this extra markup is added)
    s/\\begin\{($LISTENV)\}$AUXCMD\n((?:\s*\%[^\n]*\n)*\n?)\\end\{\1\}$AUXCMD\n/$2\n/msg;

    # Convert '\PERCENTAGE ' back into '\%' (the final question mark catches a special situation where due to a latter pre-processing step the ' ' becomes separated
    s/\\PERCENTAGE ?/\\%/g;
    # Convert '\DOLLAR ' back into '\$'
    s/\\DOLLAR /\\\$/g;

    # undo renaming of the \begin and \end,{,}  and dollars in comments
###    s/(%.*)\\BEGINDIF\{(.*)$/$1\\begin\{$2/mg ;
###    s/(%.*)\\ENDDIF\{(.*)$/$1\\end\{$2/mg ;
###    # disabled as this turned out to be a bad idea
###    1 while s/(%.*)\\CLEFTBRACED (.*)$/$1\{$2/mg ;
###    1 while s/(%.*)\\CRIGHTBRACED (.*)$/$1\}$2/mg ;

###    1 while s/(%.*)DOLLARDIF/$1\$/mg ;<
    # although we only renamed $ in comments to DOLLARDIFF, we might have lost the % in unchanged verbatim blocks, so rename all
    s/DOLLARDIF/\$/g;
###    # undo renaming of the \cite.. commands in comments
###    if ( $CITECMD ) {
###      1 while s/(%.*)\\CITEDIF($CITECMD)/$1\\$2/mg ;
###    }
    #   Convert \begin{SQUAREBRACKET} \end{SQUAREBRACKET} into \[ \]
    s/\\end\{SQUAREBRACKET\}/\\\]/sg;
    s/\\begin\{SQUAREBRACKET\}/\\\[/sg;
    # 4. Convert \begin{DOLLARDOLLAR} \end{DOLLARDOLLAR} into $$ $$
    s/\\begin\{DOLLARDOLLAR\}(.*?)\\end\{DOLLARDOLLAR\}/\$\$$1\$\$/sg;
    # 5. Convert  \SUPERSCRIPTNB{n} into ^n  and  \SUPERSCRIPT{nn} into ^{nnn}
    1 while s/\\SUPERSCRIPT(\s*\{($pat_n)\})/^$1/g;
    #    1 while s/\\SUPERSCRIPTNB\{(\s*$pat0)\}/^$1/g ;
    1 while s/\\SUPERSCRIPTNB\{(\s*$pat_n)\}/^$1/g;
    # Convert  \SUBSCRIPNB{n} into _n  and  \SUBCRIPT{nn} into _{nnn}
    1 while s/\\SUBSCRIPT(\s*\{($pat_n)\})/_$1/g;
    1 while s/\\SUBSCRIPTNB\{(\s*$pat_n)\}/_$1/g;
    # Convert  \SQRT{n} into \sqrt{n}  and  \SQRTNB{nn} into \sqrt nn
    1 while s/\\SQRT(\s*\{($pat_n)\})/\\sqrt$1/g;
    1 while s/\\SQRTNB\{(\s*$pat_n)\}/\\sqrt$1/g;

###    1 while s/(%.*)\\CCARET (.*)$/$1^$2/mg ;
###    1 while s/(%.*)\\CUNDERSCORE (.*)$/$1_$2/mg ;
###    1 while s/(%.*)\\CFRAC (.*)$/$1\\frac$2/mg ;
###    1 while s/(%.*)\\CRIGHTBRACE (.*)$/$1\}$2/mg ;
###    1 while s/(%.*)\\CLEFTBRACE (.*)$/$1\{$2/mg ;

    # on converting back I don't need to assume these are in comments
    # (at this point in the code verbatim environments have already been converted from comments into their proper form
    #  do only converting these auxiliary commands in comments does not work.
    1 while s/\\CCARET /^/g;
    1 while s/\\CUNDERSCORE /_/g;
    1 while s/\\CFRAC /\\frac/g;
    1 while s/\\CSQRT /\\sqrt/g;
    1 while s/\\CRIGHTBRACE /}/g;
    1 while s/\\CLEFTBRACE /{/g;

    #    Change \QLEFTBRACE, \QRIGHTBRACE to \{,\}
    s/\\QLEFTBRACE /\\\{/sg;
    s/\\QRIGHTBRACE /\\\}/sg;
    s/\\AMPERSAND /\\&/sg;
    # Highlight added inline verbatim commands if possible
    if ( $latexdiffpreamble =~ /\\RequirePackage(?:\[$brat_n\])?\{color\}/ ) {
      # wrap added verb commands with color commands
      s/\\DIFDIFadd((?:verb\*?|lstinline(?:\[$brat_n\])?)\{[-\d]*?\}[\s\n]*)/\{\\color{blue}$AUXCMD\n\\DIF$1%\n\}$AUXCMD\n/sg;
      s/\\DIFDIFdel((?:verb\*?|lstinline(?:\[$brat_n\])?)\{[-\d]*?\}[\s\n]*$AUXCMD)/\{\\color{red}${AUXCMD}\n\\DIF$1\n\}${AUXCMD}/sg;
    } else {
      # currently if colour markup is not used just remove the added mark
      s/\\DIFDIFadd(verb\*?|lstinline)/\\DIF$1/sg;
      s/\\DIFDIFdel((?:verb\*?|lstinline(?:\[$brat_n\])?)\{[-\d]*?\}[\s\n]*$AUXCMD\n)//sg;
    }
    # expand \verb and friends inline arguments
    s/\\DIF((?:DIFadd|DIFdel)?(?:verb\*?|lstinline(?:\[$brat_n\])?))\{([-\d]*?)\}/"\\${1}". fromhash(\%verbhash,$2)/esg;
    # add basicstyle color{blue} to added lstinline commands
    # finally add the comment to the ones not having an optional argument before
    ###s/\\DIFaddlstinline(?!\[)/\\lstinline\n[basicstyle=\\color{blue}]$AUXCMD\n/g;

  }
  return;
}

# $out = restore_item_commands($listenviron)
# short helper function for post-process, which restores deleted \item commands in its argument (as DIFAUXCMDs)
sub restore_item_commands {
  my ($string) = @_;
  my ( $itemarg, @itemargs );
  $string =~
    s/(\%DIFDELCMD < \s*(\\$ITEMCMD$extraspace)((?:<$abrat0>)?$extraspace)((?:\[$brat_n\])?)\s*((?:${cmdoptseq}\s*?)*)(?:\n|$DELCMDCLOSE))/
     # if \item has an []argument, then mark up the argument as deleted)
     if (length($4)>0) {
       # use substr to exclude square brackets at end points
       @itemargs=splitlatex(substr($4,1,length($4)-2));
       $itemarg="[".join("",marktags("","",$DELOPEN,$DELCLOSE,$DELCMDOPEN,$DELCMDCLOSE,$DELCOMMENT,\@itemargs))."]";
     } else {
       $itemarg="";
     }
     "$1$2$3$itemarg$AUXCMD\n";  ###.((length($5)>0) ? "%DIFDELCMD $5 $DELCMDCLOSE\n" : "")
     /sge;
  return ($string);
}

# @auxlines=preprocess_preamble($oldpreamble,$newpreamble);
# pre-process preamble by looking for commands used in \maketitle (title, author, date etc commands)
# the list of commands is defined in CONTEXT2CMD
# if found then use a bodydiff to mark up content, and replace the corresponding commands
# in both preambles by marked up version to 'fool' the linediff (such that only body is marked up).
# A special case are e.g. author commands being added (or removed)
# 1. If commands are added, then the entire content is marked up as new, but also the lines are marked as new in the linediff
# 2. If commands are removed, then the linediff will mark the line as deleted.  The program returns
#    with $auxlines a text to be appended at the end of the preamble, which shows the respective fields as deleted
sub preprocess_preamble {
  my ( $oldpreambleref, $newpreambleref ) = ( \$_[0], \$_[1] );
  my @auxlines = ();
  # Remember to use $$oldpreambleref to refer to oldpreamble
  my ( $titlecmd,         $titlecmdpat );
  my ( @oldtitlecommands, @newtitlecommands );
  my %oldhash = ();
  my %newhash = ();
  my ( $line, $cmd, $optarg, $arg, $optargnew, $optargold, $optargdiff, $argold, $argnew, $argdiff, $auxline );

  my $warnmsgdetail = <<EOF ;
     This should not occur for standard styles, but can occur for some specific styles, document classes,
     e.g. journal house styles.
     Workaround: Use --replace-context2cmd option to specifically set those commands, which are not repeated.
EOF

  # resuse context2cmdlist to define these commands to  look out for in preamble
  $titlecmd = "(?:" . join( "|", @CONTEXT2CMDLIST ) . ")";
  # as context2cmdlist is stored as regex, e.g. ((?-xism:^title$), we need to remove ^- fo
  # resue in a more complex regex
  $titlecmd =~ s/[\$\^]//g;
  # make sure to not match on comment lines:
  $titlecmdpat = qr/^(?:[^%\n]|\\%)*(\\($titlecmd)$extraspace(?:\[($brat_n)\])?(?:\{($pat_n)\}))/ms;
  ###print STDERR "DEBUG:",$titlecmdpat,"\n";
  @oldtitlecommands = ( $$oldpreambleref =~ m/$titlecmdpat/g );
  @newtitlecommands = ( $$newpreambleref =~ m/$titlecmdpat/g );

###  { my $cnt =0 ; my $tcmd ;
###   print STDERR "DEBUG $#oldtitlecommands\n";
###   foreach $tcmd ( @oldtitlecommands ) {
###    print STDERR "DEBUG old: $cnt : $tcmd\n";
###     $cnt++;
###  } }

  while (@oldtitlecommands) {
    $line   = shift @oldtitlecommands;
    $cmd    = shift @oldtitlecommands;
    $optarg = shift @oldtitlecommands;
    $arg    = shift @oldtitlecommands;

###    print STDERR "DEBUG old line:$line cmd:$cmd optarg:$optarg arg:$arg\n";
    if ( defined( $oldhash{$cmd} ) ) {
      warn "WARNING: $cmd is used twice in preamble of old file. Reverting to pure line diff mode for preamble.\n";
      print STDERR $warnmsgdetail;
      return;
    }
    $oldhash{$cmd} = [ $line, $optarg, $arg ];
  }
  while (@newtitlecommands) {
    $line   = shift @newtitlecommands;
    $cmd    = shift @newtitlecommands;
    $optarg = shift @newtitlecommands;
    $arg    = shift @newtitlecommands;

###    print STDERR "DEBUG new line:$line cmd:$cmd optarg:$optarg arg:$arg\n";
    if ( defined( $newhash{$cmd} ) ) {
      warn "$cmd is used twice in preamble of new file. Reverting to pure line diff mode for preamble.\n";
      print STDERR $warnmsgdetail;
      return;
    }
    $newhash{$cmd} = [ $line, $optarg, $arg ];
  }
  foreach $cmd ( keys %newhash ) {
    if ( defined( $newhash{$cmd}->[1] ) ) {
      $optargnew = $newhash{$cmd}->[1];
    } else {
      $optargnew = "";
    }
    if ( defined( $oldhash{$cmd}->[1] ) ) {
      $optargold = $oldhash{$cmd}->[1];
    } else {
      $optargold = "";
    }

    if ( defined( $oldhash{$cmd}->[2] ) ) {
      $argold = $oldhash{$cmd}->[2];
    } else {
      $argold = "";
    }
    $argnew  = $newhash{$cmd}->[2];
    $argdiff = "{" . join( "", bodydiff( $argold, $argnew ) ) . "}";
    # Replace \RIGHTBRACE by }
    $argdiff =~ s/\\RIGHTBRACE/}/g;

###    print STDERR "DEBUG cmd:$cmd argnew:$argnew argold:$argold |",defined($newhash{$cmd}),defined($oldhash{$cmd}),"|\n";
    if ( length $optargnew ) {
      $optargdiff = "[" . join( "", bodydiff( $optargold, $optargnew ) ) . "]";
      $optargdiff =~ s/\\DIFaddbegin /\\DIFaddbeginFL /g;
      $optargdiff =~ s/\\DIFaddend /\\DIFaddendFL /g;
      $optargdiff =~ s/\\DIFadd\{/\\DIFaddFL{/g;
      $optargdiff =~ s/\\DIFdelbegin /\\DIFdelbeginFL /g;
      $optargdiff =~ s/\\DIFdelend /\\DIFdelendFL /g;
      $optargdiff =~ s/\\DIFdel\{/\\DIFdelFL{/g;
    } else {
      $optargdiff = "";
    }
    ### print STDERR "DEBUG s/\\Q$newhash{$cmd}->[0]\\E/\\$cmd$optargdiff$argdiff/s\n";
    # Note: \Q and \E force literal interpretation of what it between them but allow
    #      variable interpolation, such that e.g. \title matches just that and not TAB-itle
    $$newpreambleref =~ s/\Q$newhash{$cmd}->[0]\E/\\$cmd$optargdiff$argdiff/s;
    # replace this in old preamble if necessary
    if ( defined( $oldhash{$cmd}->[0] ) ) {
      $$oldpreambleref =~ s/\Q$oldhash{$cmd}->[0]\E/\\$cmd$optargdiff$argdiff/s;
    }
    ### print STDERR "DEBUG NEW PRE ".$$newpreambleref."\n";
  }

  foreach $cmd ( keys %oldhash ) {
    # if this has already been dealt with above can just skip
    next if defined( $newhash{$cmd} );
###    print STDERR "DEBUG old line only cmd: $cmd, line:",$oldhash{$cmd}->[0]," optarg: $oldhash{$cmd}->[1] arg: $oldhash{$cmd}->[2] \n";
    $argold  = $oldhash{$cmd}->[2];
    $argdiff = "{" . join( "", bodydiff( $argold, "" ) ) . "}";
    if ( defined( $oldhash{$cmd}->[1] ) ) {
      $optargold  = $oldhash{$cmd}->[1];
      $optargdiff = "[" . join( "", bodydiff( $optargold, "" ) ) . "]";
      $optargdiff =~ s/\\DIFdelbegin /\\DIFdelbeginFL /g;
      $optargdiff =~ s/\\DIFdelend /\\DIFdelendFL /g;
      $optargdiff =~ s/\\DIFdel\{/\\DIFdelFL{/g;
    } else {
      $optargdiff = "";
    }
    $auxline = "\\$cmd$optargdiff$argdiff";
    $auxline =~ s/$/$AUXCMD/sg;
###    print STDERR "DEBUG argold $argold, argdiff: $argdiff  auxline: $auxline";
    push @auxlines, $auxline;
  }
  # add auxcmd comment to highlight added lines
  return (@auxlines);
}

# @diffs=linediff(\@seq1, \@seq2)
# mark up lines like this
#%DIF mm-mmdnn
#%< old deleted line(s)
#%DIF -------
#%DIF mmann-nn
#new appended line %<
#%DIF -------
# Future extension: mark change explicitly
# Assumes: traverse_sequence traverses deletions before insertions in changed sequences
#          all line numbers relative to line 0 (first line of real file)
sub linediff {
  my $seq1 = shift;
  my $seq2 = shift;

  my $block  = [];
  my $retseq = [];
  my @begin  = ( '', '', '' );    # dummy initialisation
  my $instring;

  my $discard = sub {
    @begin = ( 'd', $_[0], $_[1] ) unless scalar @$block;
    push( @$block, "%DIF < " . $seq1->[ $_[0] ] );
  };
  my $add = sub {
    if ( !scalar @$block ) {
      @begin = ( 'a', $_[0], $_[1] );
    } elsif ( $begin[0] eq 'd' ) {
      $begin[0] = 'c';
      $begin[2] = $_[1];
      push( @$block, "%DIF -------" );
    }
    push( @$block, $seq2->[ $_[1] ] . " %DIF > " );
  };
  my $match = sub {
    if ( scalar @$block ) {
      if ( $begin[0] eq 'd' && $begin[1] != $_[0] - 1 ) {
        $instring = sprintf "%%DIF %d-%dd%d", $begin[1], $_[0] - 1, $begin[2];
      } elsif ( $begin[0] eq 'a' && $begin[2] != $_[1] - 1 ) {
        $instring = sprintf "%%DIF %da%d-%d", $begin[1], $begin[2], $_[1] - 1;
      } elsif ( $begin[0] eq 'c' ) {
        $instring = sprintf "%%DIF %sc%s",
          ( $begin[1] == $_[0] - 1 ) ? "$begin[1]" : $begin[1] . "-" . ( $_[0] - 1 ),
          ( $begin[2] == $_[1] - 1 ) ? "$begin[2]" : $begin[2] . "-" . ( $_[1] - 1 );
      } else {
        $instring = sprintf "%%DIF %d%s%d", $begin[1], $begin[0], $begin[2];
      }
      push @$retseq, $instring, @$block, "%DIF -------";
      $block = [];
    }
    push @$retseq, $seq2->[ $_[1] ];
  };
  # key function: remove multiple spaces (such that insertion or deletion of redundant white space is not reported)
  my $keyfunc = sub { join( "  ", split( " ", shift() ) ) };

  traverse_sequences( $seq1, $seq2, { MATCH => $match, DISCARD_A => $discard, DISCARD_B => $add }, $keyfunc );
  push @$retseq, @$block if scalar @$block;

  return wantarray ? @$retseq : $retseq;
}

# init_regex_arr_data(\@array,"TOKEN INIT")
# scans DATA file handel for line "%% TOKEN INIT" line
# then appends each line not beginning with % into array (as a quoted regex)
# This is used for command lists and configuration variables, but the processing is slightly
# different:
# For lists, the regular expression is extended to include beginning (^) and end ($) markers, to require full-string matching
# For configuration variables (and all others), simply an unadorned list is copied
sub init_regex_arr_data {
  my ( $arr, $token ) = @_;
  my $copy = 0;
  my ($mode);
  if ( $token =~ m/COMMANDS/ ) {
    $mode = 0;    # Reading command list
  } else {
    $mode = 1;    # Reading configuration variables
  }

  while (<DATA>) {
    if (m/^%%BEGIN $token\s*$/) {
      $copy = 1;
      next;
    } elsif (m/^%%END $token\s*$/) {
      last;
    }
    chomp;
    if ( $mode == 0 ) {
      #      print STDERR "DEBUG init_regex_arr_data regex >$_<\n" if ($debug && $copy);
      push( @$arr, qr/^$_$/ ) if ( $copy && !/^%/ );
    } elsif ( $mode == 1 ) {
      push( @$arr, "$_" ) if ( $copy && !/^%/ );
    }
  }
  seek DATA, 0, 0;    # rewind DATA handle to file begin
}

# init_regex_arr_ext(\@array,$arg)
# appends array with regular expressions.
# if arg is a file name, then read in list of regular expressions from that file
# (one expression per line)
# Otherwise treat arg as a comma separated list of regular expressions
sub init_regex_arr_ext {
  my ( $arr, $arg ) = @_;
  if ( -f $arg ) {
    init_regex_arr_file( $arr, $arg );
  } else {
    init_regex_arr_list( $arr, $arg );
  }
}

# init_regex_arr_file(\@array,$fname)
# appends array with regular expressions.
# Read in list of regular expressions from $fname
# (one expression per line)
sub init_regex_arr_file {
  my ( $arr, $fname ) = @_;
  open( FILE, "$fname" ) or die("Couldn't open $fname: $!");
  while (<FILE>) {
    chomp;
    next if /^\s*#/ || /^\s*%/ || /^\s*$/;
    push( @$arr, qr/^$_$/ );
  }
  close(FILE);
}

# init_regex_arr_list(\@array,$arg)
# appends array with regular expressions.
# read from comma separated list of regular expressions ($arg)
sub init_regex_arr_list {
  my ( $arr, $arg ) = @_;
  my $regex;
  ###    print STDERR "DEBUG init_regex_arr_list arg >$arg<\n" if $debug;
  foreach $regex ( split( qr/(?<!\\),/, $arg ) ) {
    $regex =~ s/\\,/,/g;
    print STDERR "DEBUG init_regex_arr_list regex >$regex<\n" if $debug;
    push( @$arr, qr/^$regex$/ );
  }
}

#exetime() returns time since last execution of this command
#exetime(1) resets this time
my $lasttime = -1;    # global variable for persistence

sub exetime {
  my $reset = 0;
  my $retval;
  if ( ( scalar @_ ) >= 1 ) {
    $reset = shift;
  }
  if ($reset) {
    $lasttime = times();
  } else {
    $retval   = times() - $lasttime;
    $lasttime = $lasttime + $retval;
    return ($retval);
  }
}

sub usage {
  print STDERR <<"EOF";
Usage: $0 [options] old.tex new.tex > diff.tex

Compares two latex files and writes tex code to stdout, which has the same format as new.tex but
has all changes relative to old.tex marked up or commented. Note that old.tex and new.tex need to
be real files (not pipes or similar) as they are opened twice.

--type=markupstyle
-t markupstyle         Add code to preamble for selected markup style
                       Available styles: UNDERLINE CTRADITIONAL TRADITIONAL CFONT FONTSTRIKE INVISIBLE
                                         CHANGEBAR CCHANGEBAR CULINECHBAR CFONTCHBAR BOLD PDFCOMMENT
                                         LUAUNDERLINE
                       [ Default: UNDERLINE ]

--subtype=markstyle
-s markstyle           Add code to preamble for selected style for bracketing
                       commands (e.g. to mark changes in  margin)
                       Available styles: SAFE MARGIN DVIPSCOL COLOR ZLABEL ONLYCHANGEDPAGE (LABEL)*
                       [ Default: SAFE ]
                       * LABEL subtype is deprecated

--floattype=markstyle
-f markstyle           Add code to preamble for selected style which
                       replace standard marking and markup commands within floats
                       (e.g., marginal remarks cause an error within floats
                       so marginal marking can be disabled thus)
                       Available styles: FLOATSAFE IDENTICAL
                       [ Default: FLOATSAFE ]

--encoding=enc
-e enc                 Specify encoding of old.tex and new.tex. Typical encodings are
                       ascii, utf8, latin1, latin9.  A list of available encodings can be
                       obtained by executing
                       perl -MEncode -e 'print join ("\\n",Encode->encodings( ":all" )) ;'
                       [Default encoding is utf8 unless the first few lines of the preamble contain
                       an invocation "\\usepackage[..]{inputenc} in which case the
                       encoding chosen by this command is asssumed. Note that ASCII (standard
                       latex) is a subset of utf8]

--preamble=file
-p file                Insert file at end of preamble instead of auto-generating
                       preamble.  The preamble must define the following commands
                       \\DIFaddbegin,\\DIFaddend,\\DIFadd{..},
                       \\DIFdelbegin,\\DIFdelend,\\DIFdel{..},
                       and varieties for use within floats
                       \\DIFaddbeginFL,\\DIFaddendFL,\\DIFaddFL{..},
                       \\DIFdelbeginFL,\\DIFdelendFL,\\DIFdelFL{..}
                       (If this option is set -t, -s, and -f options
                       are ignored.)

--exclude-safecmd=exclude-file
--exclude-safecmd="cmd1,cmd2,..."
-A exclude-file
--replace-safecmd=replace-file
--append-safecmd=append-file
--append-safecmd="cmd1,cmd2,..."
-a append-file         Exclude from, replace or append to the list of regex
                       matching commands which are safe to use within the
                       scope of a \\DIFadd or \\DIFdel command.  The file must contain
                       one Perl-RegEx per line (Comment lines beginning with # or % are
                       ignored). A literal comma within the comma-separated list must be
                       escaped thus "\\,",   Note that the RegEx needs to match the whole of
                       the token, i.e., /^regex\$/ is implied and that the initial
                       "\\" of the command is not included. The --exclude-safecmd
                       and --append-safecmd options can be combined with the --replace-safecmd
                       option and can be used repeatedly to add cumulatively to the lists.

--exclude-textcmd=exclude-file
--exclude-textcmd="cmd1,cmd2,..."
-X exclude-file
--replace-textcmd=replace-file
--append-textcmd=append-file
--append-textcmd="cmd1,cmd2,..."
-x append-file         Exclude from, replace or append to the list of regex
                       matching commands whose last argument is text.  See
                       entry for --exclude-safecmd directly above for further details.

--replace-context1cmd=replace-file
--append-context1cmd=append-file
--append-context1cmd="cmd1,cmd2,..."
                       Replace or append to the list of regex matching commands
                       whose last argument is text but which require a particular
                       context to work, e.g. \\caption will only work within a figure
                       or table.  These commands behave like text commands, except when
                       they occur in a deleted section, when they are disabled, but their
                       argument is shown as deleted text.

--replace-context2cmd=replace-file
--append-context2cmd=append-file
--append-context2cmd="cmd1,cmd2,..."
                       As corresponding commands for context1.  The only difference is that
                       context2 commands are completely disabled in deleted sections, including
                       their arguments.
                       context2 commands are also the only commands in the preamble, whose argument will
                       be processed in word-by-word mode (which only works, if they occur no more than
		       once in the preamble).

--exclude-mboxsafecmd=exclude-file
--exclude-mboxsafecmd="cmd1,cmd2,..."
--append-mboxsafecmd=append-file
--append-mboxsafecmd="cmd1,cmd2,..."
                       Define safe commands, which additionally need to be protected by encapsulating
                       in an \\mbox{..}. This is sometimes needed to get around incompatibilities
                       between external packages and the ulem package, which is  used for highlighting
                       in the default style UNDERLINE as well as CULINECHBAR CFONTSTRIKE



--config var1=val1,var2=val2,...
-c var1=val1,..        Set configuration variables.
-c configfile           Available variables:
                          ARRENV (RegEx)
                          COUNTERCMD (RegEx)
                          FLOATENV (RegEx)
                          ITEMCMD (RegEx)
                          LISTENV (RegEx)
                          MATHARRENV (RegEx)
                          MATHENV (RegEx)
                          MATHREPL (String)
                          MAXCHANGESLETTER (Integer)
                          MINWORDSBLOCK (Integer)
                          PICTUREENV (RegEx)
                          SCALEDELGRAPHICS (Float)
                          VERBATIMENV (RegEx)
                          VERBATIMLINEENV (RegEx)
                          CUSTOMDIFCMD (RegEx)
                       This option can be repeated.

--add-to-config  varenv1=pattern1,varenv2=pattern2
                       For configuration variables containing a regular expression (essentially those ending
                       in ENV, and COUNTERCMD) this provides an alternative way to modify the configuration
                       variables. Instead of setting the complete pattern, with this option it is possible to add an
                       alternative pattern. varenv must be one of the variables listed above that take a regular
                       expression as argument, and pattern is any regular expression (which might need to be
                       protected from the shell by quotation). Several patterns can be added at once by using semi-colons
                       to separate them, e.g. --add-to-config "LISTENV=myitemize;myenumerate,COUNTERCMD=endnote"

--packages=pkg1,pkg2,..
                       Tell latexdiff that .tex file is processed with the packages in list
                       loaded.  This is normally not necessary if the .tex file includes the
                       preamble, as the preamble is automatically scanned for \\usepackage commands.
                       Use of the --packages option disables automatic scanning, so if for any
                       reason package specific parsing needs to be switched off, use --packages=none.
                       The following packages trigger special behaviour:
                       endfloat hyperref amsmath apacite siunitx cleveref glossaries mhchem chemformula/chemmacros
                       biblatex
                       [ Default: scan the preamble for \\usepackage commands to determine
                         loaded packages.]

--show-preamble        Print generated or included preamble commands to stdout.

--show-safecmd         Print list of regex matching and excluding safe commands.

--show-textcmd         Print list of regex matching and excluding commands with text argument.

--show-config          Show values of configuration variables

--show-all             Show all of the above

   NB For all --show commands, no old.tex or new.tex file needs to be given, and no
      differencing takes place.

Other configuration options:

--allow-spaces         Allow spaces between bracketed or braced arguments to commands
                       [Default requires arguments to directly follow each other without
                                intervening spaces]

--math-markup=level    Determine granularity of markup in displayed math environments:
                      Possible values for level are (both numerical and text labels are acceptable):
                      off or 0: suppress markup for math environments.  Deleted equations will not
                               appear in diff file. This mode can be used if all the other modes
                               cause invalid latex code.
                      whole or 1: Differencing on the level of whole equations. Even trivial changes
                               to equations cause the whole equation to be marked changed.  This
                               mode can be used if processing in coarse or fine mode results in
                               invalid latex code.
                      coarse or 2: Detect changes within equations marked up with a coarse
                               granularity; changes in equation type (e.g.displaymath to equation)
                               appear as a change to the complete equation. This mode is recommended
                               for situations where the content and order of some equations are still
                               being changed. [Default]
                      fine or 3: Detect small change in equations and mark up and fine granularity.
                               This mode is most suitable, if only minor changes to equations are
                               expected, e.g. correction of typos.

--graphics-markup=level   Change highlight style for graphics embedded with \\includegraphics commands
                      Possible values for level:
                      none,off or 0: no highlighting for figures
                      new-only or 1: surround newly added or changed figures with a blue frame [Default]
                      both or 2:     highlight new figures with a blue frame and show deleted figures
                                at reduced scale, and crossed out with a red diagonal cross. Use configuration
                                variable SCALEDELGRAPHICS to set size of deleted figures.
                      Note that changes to the optional parameters will make the figure appear as changed
                      to latexdiff, and this figure will thus be highlighted.
                      In some circumstances "Misplaced \\noalign" errors can occur if there are certain types
                      of changes in tables. In this case please use option --graphics-markup=none as a
                      work-around.

--no-del               Suppress deleted text from the diff. It is similar in effect to the BOLD style,
                       but the deleted text ist not just invisible in the output, it is also not included in the
                       diff text file. This can be more robust than just making it invisible.

--disable-citation-markup
--disable-auto-mbox    Suppress citation markup and markup of other vulnerable commands in styles
                       using ulem (UNDERLINE,FONTSTRIKE, CULINECHBAR)
                       (the two options are identical and are simply aliases)

--enable-citation-markup
--enforce-auto-mbox    Protect citation commands and other vulnerable commands in changed sections
                       with \\mbox command, i.e. use default behaviour for ulem package for other packages
                       (the two options are identical and are simply aliases)



Miscellaneous options

--label=label
-L label               Sets the labels used to describe the old and new files.  The first use
                       of this option sets the label describing the old file and the second
                       use of the option sets the label for the new file.
                       [Default: use the filename and modification dates for the label]

--no-label             Suppress inclusion of old and new file names as comment in output file

--visible-label         Include old and new filenames (or labels set with --label option) as
                       visible output

--flatten              Replace \\input and \\include commands within body by the content
                       of the files in their argument.  If \\includeonly is present in the
                       preamble, only those files are expanded into the document. However,
                       no recursion is done, i.e. \\input and \\include commands within
                       included sections are not expanded.  The included files are assumed to
                       be located in the same directories as the old and new master files,
                       respectively, making it possible to organise files into old and new directories.
                       --flatten is applied recursively, so inputted files can contain further
                       \\input statements.  Also handles files included by the import package
                       (\\import and \\subimport), and \\subfile command.

--filter-script=filterscript    Run files through this filterscript (full path preferred) before processing.
                       The filterscript must take STDIN input and output to STDOUT.
                       When coupled with --flatten, each file will be run through the filter as it is brought in.

--ignore-filter-stderr When running with --filter-script, STDERR from the script may cause readability issues.
                       Turn this flag on to ignore STDERR from the filter script.

--driver=type          Choose driver for changebar package (only relevant for styles using
                       changebar: CCHANGEBAR CFONTCHBAR CULINECHBAR CHANGEBAR). Possible
                       drivers are listed in changebar manual, e.g. pdftex,dvips,dvitops
                       [Default: pdftex]

--help
-h                     Show this help text.

--ignore-warnings      Suppress warnings about inconsistencies in length between input
                       and parsed strings and missing characters.

--verbose
-V                     Output various status information to stderr during processing.
                       Default is to work silently.

--version              Show version number.

Internal options:
These options are mostly for automated use by latexdiff-vc. They can be used directly, but
the API should be considered less stable than for the other options.

--no-links             Suppress generation of hyperreferences, used for minimal diffs
                       (option --only-changes of latexdiff-vc).

Directives:
Special comments in the latex source that modify latexdiff behaviour.
In the new file, those directives can be used:
%BEGIN DIFNOMRKUP
%END DIFNOMRKUP
  Tell latexdiff to not mark up the enclosed text.

%BEGIN DIFADD
%END DIFADD
  Tell latexdiff to mark up the enclosed text as added.

In the old file, those directives can be used:
%BEGIN DIFDEL
%END DIFDEL
  Tell latexdiff to mark up the enclosed text as deleted.

EOF
  exit 0;
}

=head1 NAME

latexdiff - determine and markup differences between two latex files

=head1 SYNOPSIS

B<latexdiff> [ B<OPTIONS> ] F<old.tex> F<new.tex> > F<diff.tex>

=head1 DESCRIPTION

Briefly, I<latexdiff> is a utility program to aid in the management of
revisions of latex documents. It compares two valid latex files, here
called C<old.tex> and C<new.tex>, finds significant differences
between them (i.e., ignoring the number of white spaces and position
of line breaks), and adds special commands to highlight the
differences.  Where visual highlighting is not possible, e.g. for changes
in the formatting, the differences are
nevertheless marked up in the source. Note that old.tex and new.tex need to
be real files (not pipes or similar) as they are opened twice (unless C<--encoding> option is used)

The program treats the preamble differently from the main document.
Differences between the preambles are found using line-based
differencing (similarly to the Unix diff command, but ignoring white
spaces).  A comment, "S<C<%DIF E<gt>>>" is appended to each added line, i.e. a
line present in C<new.tex> but not in C<old.tex>.  Discarded lines
 are deactivated by prepending "S<C<%DIF E<lt>>>". Changed blocks are preceded  by
comment lines giving information about line numbers in the original files.  Where there are insignificant
differences, the resulting file C<diff.tex> will be similar to
C<new.tex>.  At the end of the preamble, the definitions for I<latexdiff> markup commands are inserted.
In differencing the main body of the text, I<latexdiff> attempts to
satisfy the following guidelines (in order of priority):

=over 3

=item 1

If both C<old.tex> and C<new.tex> are valid LaTeX, then the resulting
C<diff.tex> should also be valid LateX. (NB If a few plain TeX commands
are used within C<old.tex> or C<new.tex> then C<diff.tex> is not
guaranteed to work but usually will).

=item 2

Significant differences are determined on the level of
individual words. All significant differences, including differences
between comments should be clearly marked in the resulting source code
C<diff.tex>.

=item 3

If a changed passage contains text or text-producing commands, then
running C<diff.tex> through LateX should produce output where added
and discarded passages are highlighted.

=item 4

Where there are insignificant differences, e.g. in the positioning of
line breaks, C<diff.tex> should follow the formatting of C<new.tex>

=back

For differencing the same algorithm as I<diff> is used but words
instead of lines are compared.  An attempt is made to recognize
blocks which are completely changed such that they can be marked up as a unit.
Comments are differenced line by line
but the number of spaces within comments is ignored. Commands including
all their arguments are generally compared as one unit, i.e., no mark-up
is inserted into the arguments of commands.  However, for a selected
number of commands (for example, C<\caption> and all sectioning
commands) the last argument is known to be text. This text is
split into words and differenced just as ordinary text (use options to
show and change the list of text commands, see below). As the
algorithm has no detailed knowledge of LaTeX, it assumes all pairs of
curly braces immediately following a command (i.e. a sequence of
letters beginning with a backslash) are arguments for that command.
As a restriction to condition 1 above it is thus necessary to surround
all arguments with curly braces, and to not insert
extraneous spaces.  For example, write

  \section{\textem{This is an emphasized section title}}

and not

  \section {\textem{This is an emphasized section title}}

or

  \section\textem{This is an emphasized section title}

even though all varieties are the same to LaTeX (but see
B<--allow-spaces> option which allows the second variety).

For environments whose content does not conform to standard LaTeX or
where graphical markup does not make sense all markup commands can be
removed by setting the PICTUREENV configuration variable, set by
default to C<picture> and C<DIFnomarkup> environments; see B<--config>
option).  The latter environment (C<DIFnomarkup>) can be used to
protect parts of the latex file where the markup results in illegal
markup. You have to surround the offending passage in both the old and
new file by C<\begin{DIFnomarkup}> and C<\end{DIFnomarkup}>. You must
define the environment in the preambles of both old and new
documents. I prefer to define it as a null-environment,

C<\newenvironment{DIFnomarkup}{}{}>

but the choice is yours.  Any markup within the environment will be
removed, and generally everything within the environment will just be
taken from the new file.

It is also possible to difference files which do not have a preamble.
 In this case, the file is processed in the main document
mode, but the definitions of the markup commands are not inserted.

All markup commands inserted by I<latexdiff> begin with "C<\DIF>".  Added
blocks containing words, commands or comments which are in C<new.tex>
but not in C<old.tex> are marked by C<\DIFaddbegin> and C<\DIFaddend>.
Discarded blocks are marked by C<\DIFdelbegin> and C<\DIFdelend>.
Within added blocks all text is highlighted with C<\DIFadd> like this:
C<\DIFadd{Added text block}>
Selected `safe' commands can be contained in these text blocks as well
(use options to show and change the list of safe commands, see below).
All other commands as well as braces "{" and "}" are never put within
the scope of C<\DIFadd>.  Added comments are marked by prepending
"S<C<%DIF E<gt> >>".

Within deleted blocks text is highlighted with C<\DIFdel>.  Deleted
comments are marked by prepending "S<C<%DIF E<lt> >>".  Non-safe command
and curly braces within deleted blocks are commented out with
"S<C<%DIFDELCMD E<lt> >>".



=head1 OPTIONS

=head2 Preamble

The following options determine the visual markup style by adding the appropriate
command definitions to the preamble. See the end of this section for a description of
available styles.

=over 4

=item B<--type=markupstyle> or
B<-t markupstyle>

Add code to preamble for selected markup style. This option defines
C<\DIFadd> and C<\DIFdel> commands.
Available styles:

C<UNDERLINE CTRADITIONAL TRADITIONAL CFONT FONTSTRIKE INVISIBLE
CHANGEBAR CCHANGEBAR CULINECHBAR CFONTCHBAR BOLD PDFCOMMENT
LUAUNDERLINE>

[ Default: C<UNDERLINE> ]

=item B<--subtype=markstyle> or
B<-s markstyle>

Add code to preamble for selected style for bracketing
commands (e.g. to mark changes in  margin). This option defines
C<\DIFaddbegin>, C<\DIFaddend>, C<\DIFdelbegin> and C<\DIFdelend> commands.
Available styles: C<SAFE MARGIN COLOR DVIPSCOL  ZLABEL ONLYCHANGEDPAGE (LABEL)*>

[ Default: C<SAFE> ]
* Subtype C<LABEL> is deprecated

=item B<--floattype=markstyle> or
B<-f markstyle>

Add code to preamble for selected style which
replace standard marking and markup commands within floats
(e.g., marginal remarks cause an error within floats
so marginal marking can be disabled thus). This option defines all
C<\DIF...FL> commands.
Available styles: C<FLOATSAFE TRADITIONALSAFE IDENTICAL>

[ Default: C<FLOATSAFE> ]

=item B<--encoding=enc> or
B<-e enc>

Specify encoding of old.tex and new.tex. Typical encodings are
C<ascii>, C<utf8>, C<latin1>, C<latin9>.  A list of available encodings can be
obtained by executing

C<perl -MEncode -e 'print join ("\n",Encode->encodings( ":all" )) ;' >

If this option is used, then old.tex, new.tex are only opened once.
[Default encoding is utf8 unless the first few lines of the preamble contain
an invocation C<\usepackage[..]{inputenc}> in which case the
encoding chosen by this command is asssumed. Note that ASCII (standard
latex) is a subset of utf8]

=item B<--preamble=file> or
B<-p file>

Insert file at end of preamble instead of generating
preamble.  The preamble must define the following commands
C<\DIFaddbegin, \DIFaddend, \DIFadd{..},
\DIFdelbegin,\DIFdelend,\DIFdel{..},>
and varieties for use within floats
C<\DIFaddbeginFL, \DIFaddendFL, \DIFaddFL{..},
\DIFdelbeginFL, \DIFdelendFL, \DIFdelFL{..}>
(If this option is set B<-t>, B<-s>, and B<-f> options
are ignored.)

=item B<--packages=pkg1,pkg2,..>

Tell latexdiff that .tex file is processed with the packages in list
loaded.  This is normally not necessary if the .tex file includes the
preamble, as the preamble is automatically scanned for C<\usepackage> commands.
Use of the B<--packages> option disables automatic scanning, so if for any
reason package specific parsing needs to be switched off, use B<--packages=none>.
The following packages trigger special behaviour:

=over 8

=item C<endfloat>

Ensure that C<\begin{figure}> and C<\end{figure}> always appear by themselves on a line.

=item C<hyperref>

Change name of C<\DIFadd> and C<\DIFdel> commands to C<\DIFaddtex> and C<\DIFdeltex> and
define new C<\DIFadd> and C<\DIFdel> commands, which provide a wrapper for these commands,
using them for the text but not for the link defining command (where any markup would cause
errors).

=item C<apacite>, C<biblatex>

Redefine the commands recognised as citation commands.

=item C<siunitx>

Treat C<\SI> as equivalent to citation commands (i.e. protect with C<\mbox> if markup style uses ulem package.

=item C<cleveref>

Treat C<\cref,\Cref>, etc as equivalent to citation commands (i.e. protect with C<\mbox> if markup style uses ulem package.

=item C<glossaries>

Define most of the glossaries commands as safe, protecting them with \mbox'es where needed

=item C<mhchem>

Treat C<\ce> as a safe command, i.e. it will be highlighted (note that C<\cee> will not be highlighted in equations as this leads to processing errors)

=item C<chemformula> or C<chemmacros>

Treat C<\ch> as a safe command outside equations, i.e. it will be highlighted (note that C<\ch> will not be highlighted in equations as this leads to processing errors)


=back

[ Default: scan the preamble for C<\usepackage> commands to determine
  loaded packages. ]


=back

=head2 Configuration

=over 4

=item B<--exclude-safecmd=exclude-file> or
B<-A exclude-file> or  B<--exclude-safecmd="cmd1,cmd2,...">

=item B<--replace-safecmd=replace-file>

=item B<--append-safecmd=append-file> or
B<-a append-file> or B<--append-safecmd="cmd1,cmd2,...">

Exclude from, replace or append to the list of regular expressions (RegEx)
matching commands which are safe to use within the
scope of a C<\DIFadd> or C<\DIFdel> command.  The file must contain
one Perl-RegEx per line (Comment lines beginning with # or % are
ignored).  Note that the RegEx needs to match the whole of
the token, i.e., /^regex$/ is implied and that the initial
"\" of the command is not included.
The B<--exclude-safecmd> and B<--append-safecmd> options can be combined with the -B<--replace-safecmd>
option and can be used repeatedly to add cumulatively to the lists.
 B<--exclude-safecmd>
and B<--append-safecmd> can also take a comma separated list as input. If a
comma for one of the regex is required, escape it thus "\,". In most cases it
will be necessary to protect the comma-separated list from the shell by putting
it in quotation marks.

=item B<--exclude-textcmd=exclude-file> or
B<-X exclude-file> or B<--exclude-textcmd="cmd1,cmd2,...">

=item B<--replace-textcmd=replace-file>

=item B<--append-textcmd=append-file> or
B<-x append-file> or B<--append-textcmd="cmd1,cmd2,...">

Exclude from, replace or append to the list of regular expressions
matching commands whose last argument is text.  See
entry for B<--exclude-safecmd> directly above for further details.


=item B<--replace-context1cmd=replace-file>

=item B<--append-context1cmd=append-file> or

=item B<--append-context1cmd="cmd1,cmd2,...">

Replace or append to the list of regex matching commands
whose last argument is text but which require a particular
context to work, e.g. C<\caption> will only work within a figure
or table.  These commands behave like text commands, except when
they occur in a deleted section, when they are disabled, but their
argument is shown as deleted text.

=item B<--replace-context2cmd=replace-file>

=item B<--append-context2cmd=append-file> or

=item B<--append-context2cmd="cmd1,cmd2,...">

As corresponding commands for context1.  The only difference is that
context2 commands are completely disabled in deleted sections, including
their arguments.

context2 commands are also the only commands in the preamble, whose argument will be processed in
word-by-word mode (which only works, if they occur no more than once in the preamble). The algorithm currently cannot cope with repeated context2 commands in the preamble, as they occur e.g. for the C<\author> argument in some journal styles (not in the standard styles, though
If such a repetition is detected, the whole preamble will be processed in line-by-line mode. In such a case, use C<--replace-context2cmd> option to just select the commands, which should be processed and are not used repeatedly in the preamble.



=item B<--exclude-mboxsafecmd=exclude-file> or B<--exclude-mboxsafecmd="cmd1,cmd2,...">

=item B<--append-mboxsafecmd=append-file> or B<--append-mboxsafecmd="cmd1,cmd2,...">

Define safe commands, which additionally need to be protected by encapsulating
in an C<\mbox{..}>. This is sometimes needed to get around incompatibilities
between external packages and the ulem package, which is  used for highlighting
in the default style UNDERLINE as well as CULINECHBAR CFONTSTRIKE





=item B<--config var1=val1,var2=val2,...> or B<-c var1=val1,..>

=item B<-c configfile>

Set configuration variables.  The option can be repeated to set different
variables (as an alternative to the comma-separated list).
Available variables (see below for further explanations):

C<ARRENV> (RegEx)

C<COUNTERCMD> (RegEx)

C<CUSTODIFCMD> (RegEx)

C<FLOATENV> (RegEx)

C<ITEMCMD> (RegEx)

C<LISTENV>  (RegEx)

C<MATHARRENV> (RegEx)

C<MATHENV> (RegEx)

C<MATHREPL> (String)

C<MAXCHANGESLETTER> (Integer)

C<MINWORDSBLOCK> (Integer)

C<PICTUREENV> (RegEx)

C<SCALEDELGRAPHICS> (Float)


=item B<--add-to-config varenv1=pattern1,varenv2=pattern2,...>

For configuration variables, which are a regular expression (essentially those ending
in ENV, COUNTERCMD and CUSTOMDIFCMD, see list above) this option provides an alternative way to modify the configuration
variables. Instead of setting the complete pattern, with this option it is possible to add an
alternative pattern. C<varenv> must be one of the variables listed above that take a regular
expression as argument, and pattern is any regular expression (which might need to be
protected from the shell by quotation). Several patterns can be added at once by using semi-colons
to separate them, e.g. C<--add-to-config "LISTENV=myitemize;myenumerate,COUNTERCMD=endnote">


=item B<--show-preamble>

Print generated or included preamble commands.

=item B<--show-safecmd>

Print list of RegEx matching and excluding safe commands.

=item B<--show-textcmd>

Print list of RegEx matching and excluding commands with text argument.

=item B<--show-config>

Show values of configuration variables.

=item B<--show-all>

Combine all --show commands.

NB For all --show commands, the behaviour is different dependent whether C<old.tex> or C<new.tex> files are specified. If they are not not then the initial setup is shown. If they are specified, then the full configuration is shown, which includes some additions of internal commands, and modifications based on what packages are present on the system, or are used in the .tex files. Either way, no differencing takes place.

=back

=head2 Other configuration options:

=over 4

=item B<--allow-spaces>

Allow spaces between bracketed or braced arguments to commands.  Note
that this option might have undesirable side effects (unrelated scope
might get lumpeded with preceding commands) so should only be used if the
default produces erroneous results.  (Default requires arguments to
directly follow each other without intervening spaces).

=item B<--math-markup=level>

Determine granularity of markup in displayed math environments:
Possible values for level are (both numerical and text labels are acceptable):

C<off> or C<0>: suppress markup for math environments.  Deleted equations will not
appear in diff file. This mode can be used if all the other modes
cause invalid latex code.

C<whole> or C<1>: Differencing on the level of whole equations. Even trivial changes
to equations cause the whole equation to be marked changed.  This
mode can be used if processing in coarse or fine mode results in
invalid latex code.

C<coarse> or C<2>: Detect changes within equations marked up with a coarse
granularity; changes in equation type (e.g.displaymath to equation)
appear as a change to the complete equation. This mode is recommended
for situations where the content and order of some equations are still
being changed. [Default]

C<fine> or C<3>: Detect small change in equations and mark up at fine granularity.
This mode is most suitable, if only minor changes to equations are
expected, e.g. correction of typos.

=item B<--graphics-markup=level>

 Change highlight style for graphics embedded with C<\includegraphics> commands.

Possible values for level:

C<none>, C<off> or C<0>: no highlighting for figures

C<new-only> or C<1>: surround newly added or changed figures with a blue frame [Default if graphicx package loaded]

C<both> or C<2>:     highlight new figures with a blue frame and show deleted figures at reduced
scale, and crossed out with a red diagonal cross. Use configuration
variable SCALEDELGRAPHICS to set size of deleted figures.

Note that changes to the optional parameters will make the figure appear as changed
to latexdiff, and this figure will thus be highlighted.

In some circumstances "Misplaced \noalign" error can occur if there are certain types
of changes in tables. In this case please use C<--graphics-markup=none> as a
work-around.


=item B<--no-del>

Suppress deleted text from the diff. It is similar in effect to the BOLD style,
but the deleted text ist not just invisible in the output, it is also not included in the diff text file.
This can be more robust than just making it invisible.

=item B<--disable-citation-markup> or B<--disable-auto-mbox>

Suppress citation markup and markup of other vulnerable commands in styles
using ulem (UNDERLINE,FONTSTRIKE, CULINECHBAR)
(the two options are identical and are simply aliases)

=item B<--enable-citation-markup> or B<--enforce-auto-mbox>

Protect citation commands and other vulnerable commands in changed sections
with C<\mbox> command, i.e. use default behaviour for ulem package for other packages
(the two options are identical and are simply aliases)

=back

=head2 Miscellaneous

=over 4

=item B<--verbose> or B<-V>

Output various status information to stderr during processing.
Default is to work silently.

=item B<--driver=type>

Choose driver for changebar package (only relevant for styles using
   changebar: CCHANGEBAR CFONTCHBAR CULINECHBAR CHANGEBAR). Possible
drivers are listed in changebar manual, e.g. pdftex,dvips,dvitops
  [Default: pdftex]

=item B<--ignore-warnings>

Suppress warnings about inconsistencies in length between input and
parsed strings and missing characters.  These warning messages are
often related to non-standard latex or latex constructions with a
syntax unknown to C<latexdiff> but the resulting difference argument
is often fully functional anyway, particularly if the non-standard
latex only occurs in parts of the text which have not changed.

=item B<--label=label> or
B<-L label>

Sets the labels used to describe the old and new files.  The first use
of this option sets the label describing the old file and the second
use of the option sets the label for the new file, i.e. set both
labels like this C<-L labelold -L labelnew>.
[Default: use the filename and modification dates for the label]

=item B<--no-label>

Suppress inclusion of old and new file names as comment in output file

=item B<--visible-label>

Include old and new filenames (or labels set with C<--label> option) as
visible output.

=item B<--flatten>

Replace C<\input> and C<\include> commands within body by the content
of the files in their argument.  If C<\includeonly> is present in the
preamble, only those files are expanded into the document. However,
no recursion is done, i.e. C<\input> and C<\include> commands within
included sections are not expanded.  The included files are assumed to
 be located in the same directories as the old and new master files,
respectively, making it possible to organise files into old and new directories.
--flatten is applied recursively, so inputted files can contain further
C<\input> statements.  Also handles files included by the import package
(C<\import> and C<\subimport>), and C<\subfile> command.

Use of this option might result in prohibitive processing times for
larger documents, and the resulting difference document
no longer reflects the structure of the input documents.

=item B<--filter-script=filterscript>

Run files through this filterscript (full path preferred) before processing.
The filterscript must take STDIN input and output to STDOUT.
When coupled with --flatten, each file will be run through the filter as it is brought in.

=item B<--ignore-filter-stderr>

When running with --filter-script, STDERR from the script may cause readability issues.
Turn this flag on to ignore STDERR from the filter script.



=item B<--help> or
B<-h>

Show help text

=item B<--version>

Show version number

=back


=head2 Internal options

These options are mostly for automated use by latexdiff-vc. They can be used directly, but the API should be considered less stable than for the other options.

=over 4

=item B<--no-links>

Suppress generation of hyperreferences, used for minimal diffs (option --only-changes of latexdiff-vc)

=back


=head2 Predefined styles

=head2 Major types

The major type determine the markup of plain text and some selected latex commands outside floats by defining the markup commands C<\DIFadd{...}> and C<\DIFdel{...}> .

=over 10

=item C<UNDERLINE>

Added text is wavy-underlined and blue, discarded text is struck out and red
(Requires color and ulem packages).  Overstriking does not work in displayed math equations such that deleted parts of equation are underlined, not struck out (this is a shortcoming inherent to the ulem package).

=item C<LUAUNDERLINE>

Added text is underlined and blue, discarded text is struck out and red
(Requires lua-ul package + LuaLaTeX).

=item C<CTRADITIONAL>

Added text is blue and set in sans-serif, and a red footnote is created for each discarded
piece of text. (Requires color package)

=item C<TRADITIONAL>

Like C<CTRADITIONAL> but without the use of color.

=item C<CFONT>

Added text is blue and set in sans-serif, and discarded text is red and very small size.

=item C<FONTSTRIKE>

Added tex is set in sans-serif, discarded text small and struck out

=item C<CCHANGEBAR>

Added text is blue, and discarded text is red.  Additionally, the changed text is marked with a bar in the margin (Requires color and changebar packages).

=item C<CFONTCHBAR>

Like C<CFONT> but with additional changebars (Requires color and changebar packages).

=item C<CULINECHBAR>

Like C<UNDERLINE> but with additional changebars (Requires color, ulem and changebar packages).

=item C<CHANGEBAR>

No mark up of text, but mark margins with changebars (Requires changebar package).

=item C<INVISIBLE>

No visible markup (but generic markup commands will still be inserted.

=item C<BOLD>

Added text is set in bold face, discarded is not shown. (also see --no-del option for another possibility to hide deleted text)

=item C<PDFCOMMENT>

The pdfcomment package is used to underline new text, and mark deletions with a PDF comment. Note that this markup might appear differently or not at all based on the pdf viewer used. The viewer with best support for pdf markup is probably acroread. This style is only recommended if the number of differences is small.

=back

=head2 Subtypes

The subtype defines the commands that are inserted at the begin and end of added or discarded blocks, irrespectively of whether these blocks contain text or commands (Defined commands: C<\DIFaddbegin, \DIFaddend, \DIFdelbegin, \DIFdelend>)

=over 10

=item C<SAFE>

No additional markup (Recommended choice)

=item C<MARGIN>

Mark beginning and end of changed blocks with symbols in the margin nearby (using
the standard C<\marginpar> command - note that this sometimes moves somewhat
from the intended position.

=item C<COLOR>

An alternative way of marking added passages in blue, and deleted ones in red.
(It is recommeneded to use instead the main types to effect colored markup,
although in some cases coloring with dvipscol can be more complete, for example
with citation commands).

=item C<DVIPSCOL>

An alternative way of marking added passages in blue, and deleted ones in red. Note
that C<DVIPSCOL> only works with the dvips converter, e.g. not pdflatex.
(it is recommeneded to use instead the main types to effect colored markup,
although in some cases coloring with dvipscol can be more complete).


=item C<ZLABEL>

can be used to highlight only changed pages, but requires post-processing. It is recommend to not call this option manually but use C<latexdiff-vc> with C<--only-changes> option. Alternatively, use the script given within preamble of diff files made using this style.

=item C<ONLYCHANGEDPAGE>

also highlights changed pages, without the need for post-processing, but might not work reliably if
there is floating material (figures, tables).

=item C<LABEL>

is similar to C<ZLABEL>, but does not need the zref package and works less reliably (deprecated).

=back

=head2 Float Types

Some of the markup used in the main text might cause problems when used within
floats (e.g. figures or tables).  For this reason alternative versions of all
markup commands are used within floats. The float type defines these alternative commands.

=over 10

=item C<FLOATSAFE>

Use identical markup for text as in the main body, but set all commands marking the begin and end of changed blocks to null-commands.  You have to choose this float type if your subtype is C<MARGIN> as C<\marginpar> does not work properly within floats.

=item C<TRADITIONALSAFE>

Mark additions the same way as in the main text.  Deleted environments are marked by angular brackets \[ and \] and the deleted text is set in scriptscript size. This float type should always be used with the C<TRADITIONAL> and  C<CTRADITIONAL> markup types as the \footnote command does not work properly in floating environments.

=item C<IDENTICAL>

Make no difference between the main text and floats.

=back


=head2 Configuration Variables

=over 10

=item C<ARRENV>

If a match to C<ARRENV> is found within an inline math environment within a deleted or added block, then the inlined math
is surrounded by C<\mbox{>...C<}>.  This is necessary as underlining does not work within inlined array environments.

[ Default: C<ARRENV>=S<C<(?:array|[pbvBV]matrix)> >

=item C<COUNTERCMD>

If a command in a deleted block which is also in the textcmd list matches C<COUNTERCMD> then an
additional command C<\addtocounter{>F<cntcmd>C<}{-1}>, where F<cntcmd> is the matching command, is appended in the diff file such that the numbering in the diff file remains synchronized with the
numbering in the new file.

[ Default: C<COUNTERCMD>=C<(?:footnote|part|section|subsection> ...

C<|subsubsection|paragraph|subparagraph)>  ]

=item C<CUSTOMDIFCMD>

This option is for advanced users and allows definition of special versions of commands, which do not work as safe commands.

Commands in C<CUSTOMDIFCMD> that occur in added or deleted blocks will be given an ADD or DEL prefix.
The prefixed versions of the command must be defined in the preamble, either by putting them
in the preamble of at least the new file, or by creating a custom preamble file (Option --preamble).
For example the command C<\blindtext> (from package blindtext) does not interact well with underlining, so that
for the standard markup type, it is not satisfactory to define it as a safe command. Instead, a customised versions
without underlining can be defined in the preamble:

C<\newcommand{\DELblindtext}{{\color{red}\blindtext}}>

C<\newcommand{\ADDblindtext}{{\color{blue}\blindtext}}>

and then latexdiff should be invoked with the option C<-c CUSTOMDIFCMD=blindtext>.

[ Default: none ]

=item C<FLOATENV>

Environments whose name matches the regular expression in C<FLOATENV> are
considered floats.  Within these environments, the I<latexdiff> markup commands
are replaced by their FL variaties.

[ Default: S<C<(?:figure|table|plate)[\w\d*@]*> >]

=item C<ITEMCMD>

Commands representing new item line with list environments.

[ Default: \C<item> ]

=item C<LISTENV>

Environments whose name matches the regular expression in C<LISTENV> are list environments.

[ Default: S<C<(?:itemize|enumerate|description)> >]

=item C<MATHENV>,C<MATHREPL>

If both \begin and \end for a math environment (environment name matching C<MATHENV> or \[ and \])
are within the same deleted block, they are replaced by a \begin and \end commands for C<MATHREPL>
rather than being commented out.

[ Default: C<MATHENV>=S<C<(?:displaymath|equation)> >, C<MATHREPL>=S<C<displaymath> >]

=item C<MAXCHANGESLETTER>
When latexdiff detects a replacement of a single word, it will attempt to identify the changes at letter level. If there are many changes, it is likely that the word was replaced wholesale, and the letter-level changes would be confusing rather than helpful. In this case, latexdiff will fall back to display the replacement at word level. The approach to distinguish both cases is to simply count the number of distinct additions and deletions (not the number of letter changed!), and only if they are less than or equal to MAXCHANGESLETTER the letter-level markup is used. Sensible values are 0, 1, or 2. 0 will disable the letter-level markup completely. 1 will only allow a single addition or deletion, e.g., for a typo correction or change singular/plural of a verb, but no substitution. 2 will allow one substitution (or two additions or deletions)---this will sometimes result in different words being marked up on letter level, e.g. they-> there will show deleted "y" and added "re", which is often not desirable.

[ Default: 1 ]

=item C<MINWORDSBLOCK>

Minimum number of tokens required to form an independent block. This value is
used in the algorithm to detect changes of complete blocks by merging identical text parts of less than C<MINWORDSBLOCK> to the preceding added and discarded parts.

[ Default: 3 ]

=item C<PICTUREENV>

Within environments whose name matches the regular expression in C<PICTUREENV>
all latexdiff markup is removed (in pathologic cases this might lead to
inconsistent markup but this situation should be rare).

[ Default: S<C<(?:picture|DIFnomarkup)[\w\d*@]*> >]

=item C<SCALEDELGRAPHICS>

If C<--graphics-markup=both> is chosen, C<SCALEDELGRAPHICS> is the factor, by which deleted figures will be scaled (i.e. 0.5 implies they are shown at half linear size).

[ Default: 0.5 ]

=item C<VERBATIMENV>

RegEx describing environments like verbatim, whose contents should be taken verbatim. The content of these environments will not be processed in any way:
deleted content is commented out, new content is not marked up

[ Default:  S<C<comment> > ]

=item C<VERBATIMLINEENV>

RegEx describing environments like verbatim, whose contents should be taken verbatim. The content of environments described by VERBATIMLINEENV are compared in
line mode, and changes are marked up using the listings package. The markup style is set based on the chosen mains markup type (Option -t), or on an analysis
of the preamble.
Note that "listings.sty" must be installed. If this file is not found the fallback solution is to
treat VERBATIMLINEENV environments treated exactly the same way as VERBATIMENV environments.

[ Default:  S<C<(?:verbatim[*]?|lstlisting> > ]

=back

=head1 DIRECTIVES

Sometimes, the output C<latexdiff> produces is not satisfactory or
some complicated constructions even lead to difference tex file that
leads to error. It is possible to give  
latexdiff some hints to control the markup by placing some special
comments, termed I<directives> into the tex file. Directives mark
blocks by paired C<BEGIN> and C<END> directives. It is important that
the directives are written exactly as specified below,i.e., all
letters need to be capitalised and there has to be exactly one space
between BEGIN/END and the block type. However, after the directive
arbitrary comments can be added. Nesting of blocks or overlapping
blocks are not parsed correctly and will cause undefined behaviour.
Blocks can be spanning across scope boundaries; they can also be used in the last argument of text commands.
If they appear in the arguments of other commands, then latexdiff will assume they were placed before or after 
the command; it is best to avoid this, though. 

=over 10 

=item C<DIFADD> block

 ...
 %BEGIN DIFADD
 ...
 %END DIFADD
 ...

Everything enclosed between the  C<%BEGIN DIFADD> and C<%END DIFADD> directives will be treated as atomistic addition to the
text. The interior will be marked up as added text following the
normal rules for what is marked up. A use case for this directive is
when a paragraph has been changed substantially but retains some of
the phrasing of the original paragraph. As latexdiff prefers to find
a minimal difference between two files, such a configuration will
usually lead to a fragmented markup, with several added and deleted
sentences or parts of sentenced and a few remaining phrases marked as
unchanged. With the use of this directive it is possible to mark the
whole modified segment as new, which will then be marked-up `en bloc'
as new, and the old part as one block of deleted material, which is
usually clearer than the fragmented default markup. 
C<DIFADD> block directives must be placed into the the body of the new
file. Those directives are ignored in the preamble or in the old file.

=item C<DIFDEL> block

 ...
 %BEGIN DIFDEL
 ...
 %END DIFDEL
 ...

Everything enclosed between the  C<%BEGIN DIFDEL> and C<%END DIFDEL>
directives will be treated as atomistic deleted text.
The interior will be marked up as deleted text following the
normal rules for what is marked up. 
C<DIFDEL> block directives must be placed into the the body of the old
file. Those directives are ignored in the preamble or in the new
file.The use case is similar to that of the C<DIFADD> blocks, but the
hint is placed in the old file. In most cases, is sufficient to either
hint in the old file with a C<DIFDEL> block I<or> in the new file with
a C<DIFADD> block and latexdiff will take care of the rest. 

=item C<DIFNOMARKUP> block

 ...
 %BEGIN DIFNOMARKUP
 ...
 %END DIFNOMARKUP
 ...

The text between the markers will be included in the diff  algorithm
but no actual markup will be made in this part of the text. It
will show the new text only and suppress the old text. If the text
immediately above the DIFNOMARKUP block has been added a
C<\DIFaddend> will be placed directly above the C<%BEGIN DIFNOMARKUP>
line and any open C<\DIFadd> command terminated, equivalently for
deleted blocks and for text added or deleted immediately after the
C<%BEGIN DIFNOMARKUP>. The main purpose of this command is to salvage
the situation if latexdiff has produced invalid  or visually
unacceptable output - markup in the offending passage can be
suppressed by surrounding it with C<DIFNOMARKUP> directives and
rerunning latexdiff, thus enabling markup of the rest of the document (but please
continue to report such failures of latexdiff as described below, so that latexdiff can be improved). 
This pair of directives must be placed in the new file and will be
ignored in the old file (or the preambles of either file). 



=back

=head1 COMMON PROBLEMS AND FAQ

=over 10

=item Changed citations result in overfull boxes

There is an incompatibility between the C<ulem> package, which C<latexdiff> uses for underlining and striking out in the UNDERLINE style,
the default style, and the way citations are generated. In order to be able to mark up citations properly, they are enclosed with an C<\mbox>
command. As mboxes cannot be broken across lines, this procedure frequently results in overfull boxes, possibly obscuring the content as it extends beyond the right margin.  The same occurs for some other packages (e.g., siunitx). If this is a problem, you have several possibilities.

1. Use C<CFONT> type markup (option C<-t CFONT>): If this markup is chosen, then changed citations are no longer marked up
with the wavy line (additions) or struck out (deletions), but are still highlighted in the appropriate color, and deleted text is shown with a different font. Other styles not using the C<ulem> package will also work.

2. Choose option C<--disable-citation-markup> which turns off the marking up of citations: deleted citations are no longer shown, and
added citations are shown without markup. (This was the default behaviour of latexdiff at versions 0.6 and older).
For custom packages you can define the commands which need to be protected by C<\mbox> with C<--append-mboxsafecmd> and C<--excludemboxsafecmd> options
(submit your lists of command as feature request at github page to set the default behaviour of future versions, see section 6)

3. If you are using luatex >= 1.12.0 you can use option LUAUNDERLINE that uses lua-ul instead of ulem for underlining, which does not have this problem (experimental feature).

=item Changes in complicated mathematical equations result in latex processing errors.

Try option C<--math-markup=whole>.   If even that fails, you can turn off mark up for equations with C<--math-markup=off>.

=item Deleted parts in equations are not struck out but underlined.

This is a limitation of the ulem package that implements the strike-out. If you use the amsmath package, then the strike-out command is redefined in such a way that deleted passages are wrapped with C<\text> command; adding C<\usepackage{amsmath}> to your preamble will trigger this behaviour. (If amsmath is not included directly, but imported by another package, latexdiff will not be able to detect its availability; in this case you can give latexdiff a hint with option C<--packages=amsmath>.


=item How can I just show the pages where changes had been made?

Use options C<--s ZLABEL>  (some postprocessing required) or C<-s ONLYCHANGEDPAGE>. C<latexdiff-vc --ps|--pdf> with C<--only-changes> option takes care of
the post-processing for you (requires zref package to be installed).

=item The character encoding breaks when running latexdiff from powershell.

This problem is not limited to C<latexdiff> and has to do with the default settings of C<powershell> in Windows. It is recommended to use C<cmd> instead.

=back

=head1 KNOWN BUGS

=over 10

=item Option C<--allow-spaces> is not implemented entirely consistently. It breaks
the rules that number and type of white space does not matter, as
different numbers of inter-argument spaces are treated as significant.

=back

Please submit bug reports using the issue tracker of the github repository page I<https://github.com/ftilmann/latexdiff.git>,
or send them to I<tilmann -- AT -- gfz-potsdam.de>.  Include the version number of I<latexdiff>
(from comments at the top of the source or use B<--version>).  If you come across latex
files that are error-free and conform to the specifications set out
above, and whose differencing still does not result in error-free
latex, please send me those files, ideally edited to only contain the
offending passage as long as that still reproduces the problem. If your
file relies on non-standard class files, you must include those.  I will not
look at examples where I have trouble to latex the original files.

=head1 SEE ALSO

L<latexrevise>, L<latexdiff-vc>

=head1 PORTABILITY

I<latexdiff> does not make use of external commands and thus should run
on any platform  supporting Perl 5.6 or higher.  If files with encodings
other than ASCII or UTF-8 are processed, Perl 5.8 or higher is required.

The standard version of I<latexdiff> requires installation of the Perl package
C<Algorithm::Diff> (available from I<www.cpan.org> -
I<http://search.cpan.org/~nedkonz/Algorithm-Diff-1.15>) but a stand-alone
version, I<latexdiff-so>, which has this package inlined, is available, too.
I<latexdiff-fast> requires the I<diff> command to be present.

=head1 AUTHOR

Version 1.3.5a
Copyright (C) 2004-2024 Frederik Tilmann

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License Version 3

Contributors of fixes and additions: V. Kuhlmann, J. Paisley, N. Becker, T. Doerges, K. Huebner,
T. Connors, Sebastian Gouezel and many others.
Thanks to the many people who sent in bug reports, feature suggestions, and other feedback.

=cut

__END__
%%BEGIN SAFE COMMANDS
% Regex matching commands which can safely be in the
% argument of a \DIFadd or \DIFdel command (leave out the \)
arabic
emph
fbox
hspace\*?
math.*
mbox
pageref
ref
eqref
symbol
rule
text.*
usebox
dag
ddag
copyright
pounds
S
P
oe
OE
ae
AE
aa
AA
o
O
l
L
frac
ss
ldots
cdots
vdots
ddots
alpha
beta
gamma
delta
epsilon
varepsilon
zeta
eta
theta
vartheta
iota
kappa
lambda
mu
nu
xi
pi
varpi
rho
varrho
sigma
varsigma
tau
upsilon
phi
varphi
chi
psi
omega
Gamma
Delta
Theta
Lambda
Xi
Pi
Sigma
Upsilon
Phi
Psi
Omega
ps
mp
times
div
ast
star
circ
bullet
cdot
cap
cup
uplus
sqcap
vee
wedge
setminus
wr
diamond
(?:big)?triangle.*
lhd
rhd
unlhd
unrhd
oplus
ominus
otimes
oslash
odot
bigcirc
d?dagger
amalg
leq
prec
preceq
ll
(?:sq)?su[bp]set(?:eq)?
in
vdash
geq
succ(?:eq)?
gg
ni
dashv
equiv
sim(?:eq)?
asymp
approx
cong
neq
doteq
propto
models
perp
mid
parallel
bowtie
Join
smile
frown
.*arrow
(?:long)?mapsto
.*harpoon.*
leadsto
aleph
hbar
imath
jmath
ell
wp
Re
Im
mho
prime
emptyset
nabla
surd
top
bot
angle
forall
exists
neg
flat
natural
sharp
backslash
partial
infty
Box
Diamond
triangle
clubsuit
diamondsuit
heartsuit
spadesuit
sum
prod
coprod
int
oint
big(?:sq)?c[au]p
bigvee
bigwedge
bigodot
bigotimes
bigoplus
biguplus
(?:arc)?(?:cos|sin|tan|cot)h?
csc
arg
deg
det
dim
exp
gcd
hom
inf
ker
lg
lim
liminf
limsup
ln
log
max
min
Pr
sec
sup
quad
qquad
bibfield
bibinfo
[Hclbkdruvt]
[`'^"~=.]
_
AMPERSAND
(SUPER|SUB)SCRIPTNB
(SUPER|SUB)SCRIPT
SQRT
SQRTNB
PERCENTAGE
DOLLAR
%%END SAFE COMMANDS

% Commands with optional or more than one non-optional arguments that are also text commands.
% They were formerly (pre-1.3.5) considered safe, but if a change is made to any of the earlier arguments
% (i.e. not the last one considered text), then invalid code would often result. 
% dashbox
% framebox
% makebox
% raisebox
% shortstack
% sqrt



%%BEGIN TEXT COMMANDS
% Regex matching commands with a text argument (leave out the \)
addcontents.*
cc
closing
chapter
dashbox
emph
encl
fbox
framebox
footnote
footnotetext
framebox
href
intertext
part
(sub){0,2}section\*?
(sub)?paragraph\*?
makebox
mbox
opening
parbox
raisebox
savebox
sbox
shortintertext
shortstack
sidenote
signature
text.*
value
underline
sqrt
%%END TEXT COMMANDS

%%BEGIN CONTEXT1 COMMANDS
% Regex matching commands with a text argument (leave out the \), which will fail out of context. These commands behave like text commands, except when they occur in a deleted section, where they are disabled, but their argument is shown as deleted text.
caption
subcaption
multicolumn
%%END CONTEXT1 COMMANDS

%%BEGIN CONTEXT2 COMMANDS
% Regex matching commands with a text argument (leave out the \), which will fail out of context.  As corresponding commands for context1.  The only difference is that context2 commands are completely disabled in deleted sections, including their arguments.
title
author
date
institute
%%END CONTEXT2 COMMANDS

%% CONFIGURATION variabe defaults
%%BEGIN LISTENV CONFIG
itemize
description
enumerate
%%END LISTENV CONFIG

%%BEGIN FLOATENV CONFIG
figure[\w\d*@]*
table[\w\d*@]*
plate[\w\d*@]*
%%END FLOATENV CONFIG

%%BEGIN PICTUREENV CONFIG
picture[\w\d*@]*
tikzpicture[\w\d*@]*
DIFnomarkup
%%END PICTUREENV CONFIG

%%BEGIN MATHENV CONFIG
equation[*]?
displaymath
math
DOLLARDOLLAR
%%END MATHENV CONFIG

%%BEGIN MATHARRENV CONFIG
eqnarray[*]?
align[*]?
alignat[*]?
gather[*]?
multline[*]?
flalign[*]?
%%END MATHARRENV CONFIG

%%BEGIN ARRENV CONFIG
aligned
gathered
multlined
array
[pbvBV]?matrix
smallmatrix
cases
%%END ARRENV CONFIG
# split


%%BEGIN COUNTERCMD CONFIG
footnote
part
chapter
section
subsection
subsubsection
paragraph
subparagraph
%%END COUNTERCMD CONFIG

%%BEGIN VERBATIMENV CONFIG
comment
%%END VERBATIMENV CONFIG

%%BEGIN VERBATIMLINEENV CONFIG
lstlisting
verbatim[*]?
%%END VERBATIMLINEENV CONFIG

%%BEGIN CUSTOMDIFCMD CONFIG
%%END CUSTOMDIFCMD CONFIG

%%% TYPES (Commands for highlighting changed blocks)

%DIF UNDERLINE PREAMBLE
\RequirePackage[normalem]{ulem}
\RequirePackage{color}\definecolor{RED}{rgb}{1,0,0}\definecolor{BLUE}{rgb}{0,0,1}
\providecommand{\DIFadd}[1]{{\protect\color{blue}\uwave{#1}}}
\providecommand{\DIFdel}[1]{{\protect\color{red}\sout{#1}}}
%DIF END UNDERLINE PREAMBLE

%DIF LUAUNDERLINE PREAMBLE
\RequirePackage{lua-ul}
\RequirePackage{color}\definecolor{RED}{rgb}{1,0,0}\definecolor{BLUE}{rgb}{0,0,1}
\providecommand{\DIFadd}[1]{{\protect\color{blue}\underLine{#1}}}
\providecommand{\DIFdel}[1]{{\protect\color{red}\strikeThrough{#1}}}
%DIF END LUAUNDERLINE PREAMBLE

%DIF CTRADITIONAL PREAMBLE
\RequirePackage{color}\definecolor{RED}{rgb}{1,0,0}\definecolor{BLUE}{rgb}{0,0,1}
\RequirePackage[stable]{footmisc}
\DeclareOldFontCommand{\sf}{\normalfont\sffamily}{\mathsf}
\providecommand{\DIFadd}[1]{{\protect\color{blue} \sf #1}}
\providecommand{\DIFdel}[1]{{\protect\color{red} [..\footnote{removed: #1} ]}}
%DIF END CTRADITIONAL PREAMBLE

%DIF TRADITIONAL PREAMBLE
\RequirePackage[stable]{footmisc}
\DeclareOldFontCommand{\sf}{\normalfont\sffamily}{\mathsf}
\providecommand{\DIFadd}[1]{{\sf #1}}
\providecommand{\DIFdel}[1]{{[..\footnote{removed: #1} ]}}
%DIF END TRADITIONAL PREAMBLE

%DIF CFONT PREAMBLE
\RequirePackage{color}\definecolor{RED}{rgb}{1,0,0}\definecolor{BLUE}{rgb}{0,0,1}
\DeclareOldFontCommand{\sf}{\normalfont\sffamily}{\mathsf}
\providecommand{\DIFadd}[1]{{\protect\color{blue} \sf #1}}
\providecommand{\DIFdel}[1]{{\protect\color{red} \scriptsize #1}}
%DIF END CFONT PREAMBLE

%DIF FONTSTRIKE PREAMBLE
\RequirePackage[normalem]{ulem}
\DeclareOldFontCommand{\sf}{\normalfont\sffamily}{\mathsf}
\providecommand{\DIFadd}[1]{{\sf #1}}
\providecommand{\DIFdel}[1]{{\footnotesize \sout{#1}}}
%DIF END FONTSTRIKE PREAMBLE

%DIF CCHANGEBAR PREAMBLE
\RequirePackage[pdftex]{changebar}
\RequirePackage{color}\definecolor{RED}{rgb}{1,0,0}\definecolor{BLUE}{rgb}{0,0,1}
\providecommand{\DIFadd}[1]{\protect\cbstart{\protect\color{blue}#1}\protect\cbend}
\providecommand{\DIFdel}[1]{\protect\cbdelete{\protect\color{red}#1}\protect\cbdelete}
%DIF END CCHANGEBAR PREAMBLE

%DIF CFONTCHBAR PREAMBLE
\RequirePackage[pdftex]{changebar}
\RequirePackage{color}\definecolor{RED}{rgb}{1,0,0}\definecolor{BLUE}{rgb}{0,0,1}
\providecommand{\DIFadd}[1]{\protect\cbstart{\protect\color{blue}\sf #1}\protect\cbend}
\providecommand{\DIFdel}[1]{\protect\cbdelete{\protect\color{red}\scriptsize #1}\protect\cbdelete}
%DIF END CFONTCHBAR PREAMBLE

%DIF CULINECHBAR PREAMBLE
\RequirePackage[normalem]{ulem}
\RequirePackage[pdftex]{changebar}
\RequirePackage{color}\definecolor{RED}{rgb}{1,0,0}\definecolor{BLUE}{rgb}{0,0,1}
\providecommand{\DIFadd}[1]{\protect\cbstart{\protect\color{blue}\uwave{#1}}\protect\cbend}
\providecommand{\DIFdel}[1]{\protect\cbdelete{\protect\color{red}\sout{#1}}\protect\cbdelete}
%DIF END CULINECHBAR PREAMBLE

%DIF CHANGEBAR PREAMBLE
\RequirePackage[pdftex]{changebar}
\providecommand{\DIFadd}[1]{\protect\cbstart{#1}\protect\cbend}
\providecommand{\DIFdel}[1]{\protect\cbdelete}
%DIF END CHANGEBAR PREAMBLE

%DIF INVISIBLE PREAMBLE
\providecommand{\DIFadd}[1]{#1}
\providecommand{\DIFdel}[1]{}
%DIF END INVISIBLE PREAMBLE

%DIF BOLD PREAMBLE
\DeclareOldFontCommand{\bf}{\normalfont\bfseries}{\mathbf}
\providecommand{\DIFadd}[1]{{\bf #1}}
\providecommand{\DIFdel}[1]{}
%DIF END BOLD PREAMBLE

%DIF PDFCOMMENT PREAMBLE
\RequirePackage{pdfcomment} %DIF PREAMBLE
\providecommand{\DIFadd}[1]{\pdfmarkupcomment[author=ADD:,markup=Underline]{#1}{}}
\providecommand{\DIFdel}[1]{\pdfcomment[icon=Insert,author=DEL:,hspace=12pt]{#1}}
%DIF END PDFCOMMENT PREAMBLE

%% SUBTYPES (Markers for beginning and end of changed blocks)

%DIF SAFE PREAMBLE
\providecommand{\DIFaddbegin}{}
\providecommand{\DIFaddend}{}
\providecommand{\DIFdelbegin}{}
\providecommand{\DIFdelend}{}
\providecommand{\DIFmodbegin}{}
\providecommand{\DIFmodend}{}
%DIF END SAFE PREAMBLE

%DIF MARGIN PREAMBLE
\providecommand{\DIFaddbegin}{\protect\marginpar{a[}}
\providecommand{\DIFaddend}{\protect\marginpar{]}}
\providecommand{\DIFdelbegin}{\protect\marginpar{d[}}
\providecommand{\DIFdelend}{\protect\marginpar{]}}
\providecommand{\DIFmodbegin}{\protect\marginpar{m[}}
\providecommand{\DIFmodend}{\protect\marginpar{]}}
%DIF END MARGIN PREAMBLE

%DIF DVIPSCOL PREAMBLE
%Note: only works with dvips converter
\RequirePackage{color}
\RequirePackage{dvipscol}
\providecommand{\DIFaddbegin}{\protect\nogroupcolor{blue}}
\providecommand{\DIFaddend}{\protect\nogroupcolor{black}}
\providecommand{\DIFdelbegin}{\protect\nogroupcolor{red}}
\providecommand{\DIFdelend}{\protect\nogroupcolor{black}}
\providecommand{\DIFmodbegin}{}
\providecommand{\DIFmodend}{}
%DIF END DVIPSCOL PREAMBLE

%DIF COLOR PREAMBLE
\RequirePackage{color}
\providecommand{\DIFaddbegin}{\protect\color{blue}}
\providecommand{\DIFaddend}{\protect\color{black}}
\providecommand{\DIFdelbegin}{\protect\color{red}}
\providecommand{\DIFdelend}{\protect\color{black}}
\providecommand{\DIFmodbegin}{}
\providecommand{\DIFmodend}{}
%DIF END COLOR PREAMBLE

%DIF LABEL PREAMBLE
% To show only pages with changes (pdf) (external program pdftk needs to be installed)
% (only works for simple documents with non-repeated page numbers, otherwise use ZLABEL)
% pdflatex diff.tex
% pdflatex diff.tex
%pdftk diff.pdf cat \
%`perl -lne '\
% if (m/\\newlabel{DIFchg[b](\d*)}{{.*}{(.*)}}/) { $start{$1}=$2; print $2}\
% if (m/\\newlabel{DIFchg[e](\d*)}{{.*}{(.*)}}/) { \
%      if (defined($start{$1})) { \
%         for ($j=$start{$1}; $j<=$2; $j++) {print "$j";}\
%      } else { \
%         print "$2"\
%      }\
% }' diff.aux \
% | uniq \
% | tr  \\n ' '` \
% output diff-changedpages.pdf
% To show only pages with changes (dvips/dvipdf)
% dvips -pp `\
% [ put here the perl script from above]
% | uniq | tr -s \\n ','`
\typeout{Check comments in preamble of output for instructions how to show only pages where changes have been made}
\newcount\DIFcounterb
\global\DIFcounterb 0\relax
\newcount\DIFcountere
\global\DIFcountere 0\relax
\providecommand{\DIFaddbegin}{\global\advance\DIFcounterb 1\relax\label{DIFchgb\the\DIFcounterb}}
\providecommand{\DIFaddend}{\global\advance\DIFcountere 1\relax\label{DIFchge\the\DIFcountere}}
\providecommand{\DIFdelbegin}{\global\advance\DIFcounterb 1\relax\label{DIFchgb\the\DIFcounterb}}
\providecommand{\DIFdelend}{\global\advance\DIFcountere 1\relax\label{DIFchge\the\DIFcountere}}
\providecommand{\DIFmodbegin}{\global\advance\DIFcounterb 1\relax\label{DIFchgb\the\DIFcounterb}}
\providecommand{\DIFmodend}{\global\advance\DIFcountere 1\relax\label{DIFchge\the\DIFcountere}}
%DIF END LABEL PREAMBLE

%DIF ZLABEL PREAMBLE
% To show only pages with changes (pdf) (external program pdftk needs to be installed)
% (uses zref for reference to absolute page numbers)
% pdflatex diff.tex
% pdflatex diff.tex
%pdftk diff.pdf cat \
%`perl -lne 'if (m/\\zref\@newlabel{DIFchgb(\d*)}{.*\\abspage{(\d*)}}/ ) { $start{$1}=$2; print $2 } \
%  if (m/\\zref\@newlabel{DIFchge(\d*)}{.*\\abspage{(\d*)}}/) { \
%      if (defined($start{$1})) { \
%         for ($j=$start{$1}; $j<=$2; $j++) {print "$j";}\
%      } else { \
%         print "$2"\
%      }\
% }' diff.aux \
% | uniq \
% | tr  \\n ' '` \
% output diff-changedpages.pdf
% To show only pages with changes (dvips/dvipdf)
% latex diff.tex
% latex diff.tex
% dvips -pp `perl -lne 'if (m/\\newlabel{DIFchg[be]\d*}{{.*}{(.*)}}/) { print $1 }' diff.aux | uniq | tr -s \\n ','` diff.dvi
\typeout{Check comments in preamble of output for instructions how to show only pages where changes have been made}
\usepackage[user,abspage]{zref}
\newcount\DIFcounterb
\global\DIFcounterb 0\relax
\newcount\DIFcountere
\global\DIFcountere 0\relax
\providecommand{\DIFaddbegin}{\global\advance\DIFcounterb 1\relax\zlabel{DIFchgb\the\DIFcounterb}}
\providecommand{\DIFaddend}{\global\advance\DIFcountere 1\relax\zlabel{DIFchge\the\DIFcountere}}
\providecommand{\DIFdelbegin}{\global\advance\DIFcounterb 1\relax\zlabel{DIFchgb\the\DIFcounterb}}
\providecommand{\DIFdelend}{\global\advance\DIFcountere 1\relax\zlabel{DIFchge\the\DIFcountere}}
\providecommand{\DIFmodbegin}{\global\advance\DIFcounterb 1\relax\zlabel{DIFchgb\the\DIFcounterb}}
\providecommand{\DIFmodend}{\global\advance\DIFcountere 1\relax\zlabel{DIFchge\the\DIFcountere}}
%DIF END ZLABEL PREAMBLE

%DIF ONLYCHANGEDPAGE PREAMBLE
\RequirePackage{atbegshi}
\RequirePackage{etoolbox}
\RequirePackage{zref}
% redefine label command to write immediately to aux file - page references will be lost
\makeatletter \let\oldlabel\label% Store \label
\renewcommand{\label}[1]{% Update \label to write to the .aux immediately
\zref@wrapper@immediate{\oldlabel{#1}}}
\makeatother
\newbool{DIFkeeppage}
\newbool{DIFchange}
\boolfalse{DIFkeeppage}
\boolfalse{DIFchange}
\AtBeginShipout{%
  \ifbool{DIFkeeppage}
        {\global\boolfalse{DIFkeeppage}}  % True DIFkeeppage
         {\ifbool{DIFchange}{\global\boolfalse{DIFkeeppage}}{\global\boolfalse{DIFkeeppage}\AtBeginShipoutDiscard}} % False DIFkeeppage
}
\providecommand{\DIFaddbegin}{\global\booltrue{DIFkeeppage}\global\booltrue{DIFchange}}
\providecommand{\DIFaddend}{\global\booltrue{DIFkeeppage}\global\boolfalse{DIFchange}}
\providecommand{\DIFdelbegin}{\global\booltrue{DIFkeeppage}\global\booltrue{DIFchange}}
\providecommand{\DIFdelend}{\global\booltrue{DIFkeeppage}\global\boolfalse{DIFchange}}
\providecommand{\DIFmodbegin}{\global\booltrue{DIFkeeppage}\global\booltrue{DIFchange}}
\providecommand{\DIFmodend}{\global\booltrue{DIFkeeppage}\global\boolfalse{DIFchange}}
%DIF END ONLYCHANGEDPAGE PREAMBLE

%% FLOAT TYPES

%DIF FLOATSAFE PREAMBLE
\providecommand{\DIFaddFL}[1]{\DIFadd{#1}}
\providecommand{\DIFdelFL}[1]{\DIFdel{#1}}
\providecommand{\DIFaddbeginFL}{}
\providecommand{\DIFaddendFL}{}
\providecommand{\DIFdelbeginFL}{}
\providecommand{\DIFdelendFL}{}
%DIF END FLOATSAFE PREAMBLE

%DIF IDENTICAL PREAMBLE
\providecommand{\DIFaddFL}[1]{\DIFadd{#1}}
\providecommand{\DIFdelFL}[1]{\DIFdel{#1}}
\providecommand{\DIFaddbeginFL}{\DIFaddbegin}
\providecommand{\DIFaddendFL}{\DIFaddend}
\providecommand{\DIFdelbeginFL}{\DIFdelbegin}
\providecommand{\DIFdelendFL}{\DIFdelend}
%DIF END IDENTICAL PREAMBLE

%DIF TRADITIONALSAFE PREAMBLE
% procidecommand color to make this work for TRADITIONAL and CTRADITIONAL
\providecommand{\color}[1]{}
\providecommand{\DIFaddFL}[1]{\DIFadd{#1}}
\providecommand{\DIFdel}[1]{{\protect\color{red}[..{\scriptsize {removed: #1}} ]}}
\providecommand{\DIFaddbeginFL}{}
\providecommand{\DIFaddendFL}{}
\providecommand{\DIFdelbeginFL}{}
\providecommand{\DIFdelendFL}{}
%DIF END TRADITIONALSAFE PREAMBLE

% see:
%  http://tex.stackexchange.com/questions/47351/can-i-redefine-a-command-to-contain-itself

%DIF HIGHLIGHTGRAPHICS PREAMBLE
\RequirePackage{settobox}
\RequirePackage{letltxmacro}
\newsavebox{\DIFdelgraphicsbox}
\newlength{\DIFdelgraphicswidth}
\newlength{\DIFdelgraphicsheight}
% store original definition of \includegraphics
\LetLtxMacro{\DIFOincludegraphics}{\includegraphics}
\providecommand{\DIFaddincludegraphics}[2][]{{\color{blue}\fbox{\DIFOincludegraphics[#1]{#2}}}}
\providecommand{\DIFdelincludegraphics}[2][]{%
\sbox{\DIFdelgraphicsbox}{\DIFOincludegraphics[#1]{#2}}%
\settoboxwidth{\DIFdelgraphicswidth}{\DIFdelgraphicsbox}
\settoboxtotalheight{\DIFdelgraphicsheight}{\DIFdelgraphicsbox}
\scalebox{\DIFscaledelfig}{%
\parbox[b]{\DIFdelgraphicswidth}{\usebox{\DIFdelgraphicsbox}\\[-\baselineskip] \rule{\DIFdelgraphicswidth}{0em}}\llap{\resizebox{\DIFdelgraphicswidth}{\DIFdelgraphicsheight}{%
\setlength{\unitlength}{\DIFdelgraphicswidth}%
\begin{picture}(1,1)%
\thicklines\linethickness{2pt}
{\color[rgb]{1,0,0}\put(0,0){\framebox(1,1){}}}%
{\color[rgb]{1,0,0}\put(0,0){\line( 1,1){1}}}%
{\color[rgb]{1,0,0}\put(0,1){\line(1,-1){1}}}%
\end{picture}%
}\hspace*{3pt}}}
}
\LetLtxMacro{\DIFOaddbegin}{\DIFaddbegin}
\LetLtxMacro{\DIFOaddend}{\DIFaddend}
\LetLtxMacro{\DIFOdelbegin}{\DIFdelbegin}
\LetLtxMacro{\DIFOdelend}{\DIFdelend}
\DeclareRobustCommand{\DIFaddbegin}{\DIFOaddbegin \let\includegraphics\DIFaddincludegraphics}
\DeclareRobustCommand{\DIFaddend}{\DIFOaddend \let\includegraphics\DIFOincludegraphics}
\DeclareRobustCommand{\DIFdelbegin}{\DIFOdelbegin \let\includegraphics\DIFdelincludegraphics}
\DeclareRobustCommand{\DIFdelend}{\DIFOaddend \let\includegraphics\DIFOincludegraphics}
\LetLtxMacro{\DIFOaddbeginFL}{\DIFaddbeginFL}
\LetLtxMacro{\DIFOaddendFL}{\DIFaddendFL}
\LetLtxMacro{\DIFOdelbeginFL}{\DIFdelbeginFL}
\LetLtxMacro{\DIFOdelendFL}{\DIFdelendFL}
\DeclareRobustCommand{\DIFaddbeginFL}{\DIFOaddbeginFL \let\includegraphics\DIFaddincludegraphics}
\DeclareRobustCommand{\DIFaddendFL}{\DIFOaddendFL \let\includegraphics\DIFOincludegraphics}
\DeclareRobustCommand{\DIFdelbeginFL}{\DIFOdelbeginFL \let\includegraphics\DIFdelincludegraphics}
\DeclareRobustCommand{\DIFdelendFL}{\DIFOaddendFL \let\includegraphics\DIFOincludegraphics}
%DIF END HIGHLIGHTGRAPHICS PREAMBLE

%% SPECIAL PACKAGE PREAMBLE COMMANDS

%% Redefine strike out command to wrap in text box if amsmath is used and markup style with ulem is used
%DIF AMSMATHULEM PREAMBLE
\makeatletter
\let\sout@orig\sout
\renewcommand{\sout}[1]{\ifmmode\text{\sout@orig{\ensuremath{#1}}}\else\sout@orig{#1}\fi}
\makeatother
%DIF END AMSMATHULEM PREAMBLE


% Standard \DIFadd and \DIFdel are redefined as \DIFaddtex and \DIFdeltex
% when hyperref package is included.
%DIF HYPERREF PREAMBLE
\providecommand{\DIFadd}[1]{\texorpdfstring{\DIFaddtex{#1}}{#1}}
\providecommand{\DIFdel}[1]{\texorpdfstring{\DIFdeltex{#1}}{}}
%DIF END HYPERREF PREAMBLE

%DIF LISTINGS PREAMBLE
\RequirePackage{listings}
\lstdefinelanguage{DIFcode}{
  % note that the definitions in the following two lines are overwritten dependent on the markup type selected %DIFCODE TEMPLATE
  morecomment=[il]{\%DIF\ <\ },          %DIFCODE TEMPLATE
  moredelim=[il][\bfseries]{\%DIF\ >\ }  %DIFCODE TEMPLATE
}
\lstdefinestyle{DIFverbatimstyle}{
	language=DIFcode,
	basicstyle=\ttfamily,
	columns=fullflexible,
	keepspaces=true
}
\lstnewenvironment{DIFverbatim}[1][]{\lstset{style=DIFverbatimstyle,#1}}{}
\lstnewenvironment{DIFverbatim*}[1][]{\lstset{style=DIFverbatimstyle,showspaces=true,#1}}{}
%DIF END LISTINGS PREAMBLE

%DIF COLORLISTINGS PREAMBLE
\RequirePackage{listings}
\RequirePackage{color}
\lstdefinelanguage{DIFcode}{
  % note that the definitions in the following two lines are overwritten dependent on the markup type selected %DIFCODE TEMPLATE
  morecomment=[il]{\%DIF\ <\ },          %DIFCODE TEMPLATE
  moredelim=[il][\bfseries]{\%DIF\ >\ }  %DIFCODE TEMPLATE
}
\lstdefinestyle{DIFverbatimstyle}{
	language=DIFcode,
	basicstyle=\ttfamily,
	columns=fullflexible,
	keepspaces=true
}
\lstnewenvironment{DIFverbatim}[1][]{\lstset{style=DIFverbatimstyle}}{}
\lstnewenvironment{DIFverbatim*}[1][]{\lstset{style=DIFverbatimstyle,showspaces=true}}{}
%DIF END COLORLISTINGS PREAMBLE

%DIF DIFCODE_UNDERLINE
  moredelim=[il][\color{red}\sout]{\%DIF\ <\ },
  moredelim=[il][\color{blue}\uwave]{\%DIF\ >\ }
%DIF END DIFCODE_UNDERLINE

%DIF DIFCODE_CTRADITIONAL
  moredelim=[il][\color{red}\scriptsize]{\%DIF\ <\ },
  moredelim=[il][\color{blue}\sffamily]{\%DIF\ >\ }
%DIF END DIFCODE_CTRADITIONAL

%DIF DIFCODE_TRADITIONAL
  moredelim=[il][\color{white}\tiny]{\%DIF\ <\ },
  moredelim=[il][\sffamily]{\%DIF\ >\ }
%DIF END DIFCODE_TRADITIONAL

%DIF DIFCODE_CFONT
  moredelim=[il][\color{red}\scriptsize]{\%DIF\ <\ },
  moredelim=[il][\color{blue}\sffamily]{\%DIF\ >\ }
%DIF END DIFCODE_CFONT

%DIF DIFCODE_FONTSTRIKE
  moredelim=[il][\scriptsize \sout]{\%DIF\ <\ },
  moredelim=[il][\sffamily]{\%DIF\ >\ }
%DIF END DIFCODE_FONTSTRIKE

%DIF DIFCODE_INVISIBLE
  moredelim=[il][\color{white}\tiny]{\%DIF\ <\ },
  moredelim=[il]{\%DIF\ >\ }
%DIF END DIFCODE_INVISIBLE

%DIF DIFCODE_CHANGEBAR
  moredelim=[il][\color{white}\tiny]{\%DIF\ <\ },
  moredelim=[il]{\%DIF\ >\ }
%DIF END DIFCODE_CHANGEBAR

%DIF DIFCODE_CCHANGEBAR
  moredelim=[il][\color{red}]{\%DIF\ <\ },
  moredelim=[il][\color{blue}]{\%DIF\ >\ }
%DIF END DIFCODE_CCHANGEBAR

%DIF DIFCODE_CULINECHBAR
  moredelim=[il][\color{red}\sout]{\%DIF\ <\ },
  moredelim=[il][\color{blue}\uwave]{\%DIF\ >\ }
%DIF END DIFCODE_CULINECHBAR

%DIF DIFCODE_CFONTCHBAR
  moredelim=[il][\color{red}\scriptsize]{\%DIF\ <\ },
  moredelim=[il][\color{blue}\sffamily]{\%DIF\ >\ }
%DIF END DIFCODE_CFONTCHBAR

%DIF DIFCODE_BOLD
  % unfortunately \bfseries cannot be combined with ttfamily without extra packages
  % also morecomment=[il] is broken as of v1.5b of listings at least
  % workaround: plot in white with tiny font
  % morecomment=[il]{\%DIF\ <\ },
  moredelim=[il][\color{white}\tiny]{\%DIF\ <\ },
  moredelim=[il][\sffamily\bfseries]{\%DIF\ >\ }
%DIF END DIFCODE_BOLD

%DIF DIFCODE_PDFCOMMENT

  moredelim=[il][\color{white}\tiny]{\%DIF\ <\ },
  moredelim=[il][\sffamily\bfseries]{\%DIF\ >\ }
%DIF END DIFCODE_PDFCOMMENT

