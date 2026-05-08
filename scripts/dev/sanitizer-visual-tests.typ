#set page(width: 620pt, height: auto, margin: 18pt)
#set text(size: 10pt)

#let test(title, body) = [
  == #title

  #image.decode(
    "<svg xmlns='http://www.w3.org/2000/svg'
          xmlns:xlink='http://www.w3.org/1999/xlink'
          width='420'
          height='130'>
      <rect width='420' height='130' fill='green'/>
      <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
      " + body + "
    </svg>",
    format: "svg",
  )
]

#let section(name) = [
  #pagebreak(weak: true)
  = #name
]

#section("1. Direct script injection")

#test(
  "1.01 SCRIPT block lowercase",
  "
  <script>SCRIPT_LOWER_CANARY_SHOULD_BE_REMOVED</script>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no SCRIPT_LOWER_CANARY</text>
  ",
)

#test(
  "1.02 SCRIPT block mixed case",
  "
  <SCRIPT>SCRIPT_UPPER_CANARY_SHOULD_BE_REMOVED</SCRIPT>
  <ScRiPt>SCRIPT_MIXED_CANARY_SHOULD_BE_REMOVED</ScRiPt>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no SCRIPT_*_CANARY</text>
  ",
)

#test(
  "1.03 self-closing script tag",
  "
  <script src='data:text/javascript,SCRIPT_SELFCLOSE_CANARY_SHOULD_BE_REMOVED'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no SCRIPT_SELFCLOSE_CANARY</text>
  ",
)

#test(
  "1.04 typed script tag",
  "
  <script type='application/ecmascript'>SCRIPT_TYPED_CANARY_SHOULD_BE_REMOVED</script>
  <script type='text/javascript'>SCRIPT_TYPED_CANARY_SHOULD_BE_REMOVED</script>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no SCRIPT_TYPED_CANARY</text>
  ",
)

#test(
  "1.05 CDATA wrapped script",
  "
  <script><![CDATA[CDATA_SCRIPT_CANARY_SHOULD_BE_REMOVED]]></script>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no CDATA_SCRIPT_CANARY</text>
  ",
)

#test(
  "1.06 SMIL handler element",
  "
  <handler type='application/ecmascript'>HANDLER_CANARY_SHOULD_BE_REMOVED</handler>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no HANDLER_CANARY (gap if present)</text>
  ",
)

#test(
  "1.07 style element block",
  "
  <style>rect { fill: red !important; } STYLE_ELEMENT_CANARY_SHOULD_BE_REMOVED</style>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no STYLE_ELEMENT_CANARY (gap if present)</text>
  ",
)

#section("2. Event handlers")

#test(
  "2.01 event handler basic",
  "
  <rect width='420' height='130' fill='green' onclick='EVT_BASIC_CANARY_SHOULD_BE_REMOVED'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no EVT_BASIC_CANARY</text>
  ",
)

#test(
  "2.02 event handler mixed case",
  "
  <rect width='420' height='130' fill='green' OnClick='EVT_MIXED_CANARY_SHOULD_BE_REMOVED' ONLOAD='EVT_MIXED_CANARY'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no EVT_MIXED_CANARY</text>
  ",
)

#test(
  "2.03 event handler namespaced",
  "
  <rect width='420' height='130' fill='green' xmlns:ev='urn:test' ev:onclick='EVT_NS_CANARY_SHOULD_BE_REMOVED'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no EVT_NS_CANARY</text>
  ",
)

#test(
  "2.04 event handler on root svg",
  "
  <g onload='EVT_ROOT_CANARY_SHOULD_BE_REMOVED'>
    <rect width='420' height='130' fill='green'/>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no EVT_ROOT_CANARY</text>
  </g>
  ",
)

#test(
  "2.05 event handler on animation",
  "
  <rect id='evt-anim' width='420' height='130' fill='green'/>
  <animate xlink:href='#evt-anim'
           attributeName='fill'
           values='green;blue'
           dur='0.2s'
           onbegin='EVT_ANIM_CANARY_SHOULD_BE_REMOVED'
           onend='EVT_ANIM_CANARY'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no EVT_ANIM_CANARY</text>
  ",
)

#section("3. javascript: protocol obfuscation")

#test(
  "3.01 javascript href direct",
  "
  <a href='javascript:JS_DIRECT_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no JS_DIRECT_CANARY</text>
  </a>
  ",
)

#test(
  "3.02 javascript xlink href",
  "
  <a xlink:href='javascript:JS_XLINK_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no JS_XLINK_CANARY</text>
  </a>
  ",
)

#test(
  "3.03 javascript mixed case",
  "
  <a xlink:href='JaVaScRiPt:JS_CASE_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no JS_CASE_CANARY</text>
  </a>
  ",
)

#test(
  "3.04 javascript with leading whitespace",
  "
  <a href='  javascript :JS_WS_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no JS_WS_CANARY</text>
  </a>
  ",
)

#test(
  "3.05 javascript via entity-encoded chars",
  "
  <a href='java&#x73;cript&#x3a;JS_ENTITY_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no JS_ENTITY_CANARY</text>
  </a>
  ",
)

#test(
  "3.06 javascript via entity whitespace",
  "
  <a href='java&#x09;script&#x0a;:JS_ENTITY_WS_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no JS_ENTITY_WS_CANARY</text>
  </a>
  ",
)

#test(
  "3.07 javascript via numeric entity colon",
  "
  <a href='javascript&#58;JS_COLON_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no JS_COLON_CANARY</text>
  </a>
  ",
)

#test(
  "3.08 namespaced href ending in :href",
  "
  <a foo:href='javascript:NS_HREF_CANARY_SHOULD_BE_REMOVED' xmlns:foo='urn:test'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no NS_HREF_CANARY</text>
  </a>
  ",
)

#test(
  "3.09 custom-ns href javascript",
  "
  <a xmlns:custom='urn:test' custom:href='javascript:CUSTOM_HREF_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no CUSTOM_HREF_CANARY</text>
  </a>
  ",
)

#test(
  "3.10 file URL",
  "
  <a href='file:///FILE_CANARY_SHOULD_BE_REMOVED'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no FILE_CANARY</text>
  </a>
  ",
)

#test(
  "3.11 use element javascript href",
  "
  <use href='javascript:USE_JS_CANARY_SHOULD_BE_REMOVED'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no USE_JS_CANARY</text>
  ",
)

#test(
  "3.12 use element external svg",
  "
  <use href='https://evil.example.invalid/fail.svg#payload'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: external use blocked</text>
  ",
)

#section("4. data: URL handling")

#test(
  "4.01 data text/html visual",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:text/html,%3Cbody style=%22margin:0;background:red;color:white;font-size:28px%22%3EFAIL data html%3C/body%3E'/>
  ",
)

#test(
  "4.02 data application/xhtml+xml visual",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:application/xhtml+xml,%3Chtml xmlns=%22http://www.w3.org/1999/xhtml%22%3E%3Cbody style=%22margin:0;background:red;color:white;font-size:28px%22%3EFAIL xhtml%3C/body%3E%3C/html%3E'/>
  ",
)

#test(
  "4.03 data url whitespace in prefix",
  "
  <image x='0' y='0' width='420' height='130'
    href='data: text/html,%3Cbody style=%22background:red%22%3EFAIL data ws%3C/body%3E'/>
  ",
)

#test(
  "4.04 data url mixed case prefix",
  "
  <image x='0' y='0' width='420' height='130'
    href='DaTa:text/html,%3Cbody%20style=%22background:red%22%3EFAIL data case%3C/body%3E'/>
  ",
)

#test(
  "4.05 data video allowed",
  "
  <video x='20' y='55' width='120' height='60'
    src='data:video/mp4;base64,AAAA'/>
  <text x='155' y='88' font-size='14' fill='white'>data:video may remain</text>
  ",
)

#test(
  "4.06 data audio allowed",
  "
  <audio src='data:audio/mpeg;base64,AAAA'/>
  <text x='14' y='82' font-size='14' fill='white'>data:audio may remain</text>
  ",
)

#section("5. Nested data:image/svg+xml recursion")

#test(
  "5.01 nested SVG with style url",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22420%22 height=%22130%22%3E%3Crect width=%22420%22 height=%22130%22 fill=%22green%22 style=%22fill:red%3Bbackground-image:url(https://example.invalid/fail.png)%22/%3E%3Ctext x=%2214%22 y=%2236%22 font-size=%2218%22 fill=%22white%22%3EPASS if green%3C/text%3E%3C/svg%3E'/>
  ",
)

#test(
  "5.02 nested SVG with @import",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22420%22 height=%22130%22%3E%3Crect width=%22420%22 height=%22130%22 fill=%22green%22 style=%22fill:red%3B@import url(https://example.invalid/fail.css)%22/%3E%3Ctext x=%2214%22 y=%2236%22 font-size=%2218%22 fill=%22white%22%3EPASS if green%3C/text%3E%3C/svg%3E'/>
  ",
)

#test(
  "5.03 nested base64 SVG with script",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MjAiIGhlaWdodD0iMTMwIj48cmVjdCB3aWR0aD0iNDIwIiBoZWlnaHQ9IjEzMCIgZmlsbD0iZ3JlZW4iLz48c2NyaXB0PkI2NF9ORVNURURfU0NSSVBUX0NBTkFSWV9TSE9VTERfQkVfUkVNT1ZFRDwvc2NyaXB0Pjx0ZXh0IHg9IjE0IiB5PSIzNiIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiPlBBU1MgaWYgZ3JlZW48L3RleHQ+PC9zdmc+'/>
  ",
)

#test(
  "5.04 nested SVG with event attrs",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22420%22 height=%22130%22%3E%3Crect width=%22420%22 height=%22130%22 fill=%22green%22 onclick=%22NESTED_EVENT_CANARY%22 onload=%22NESTED_EVENT_CANARY%22/%3E%3Ctext x=%2214%22 y=%2236%22 font-size=%2218%22 fill=%22white%22%3EPASS if green%3C/text%3E%3C/svg%3E'/>
  ",
)

#test(
  "5.05 nested SVG with javascript href",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22420%22 height=%22130%22%3E%3Crect width=%22420%22 height=%22130%22 fill=%22green%22/%3E%3Ca href=%22javascript:NESTED_JS_CANARY%22%3E%3Ctext x=%2214%22 y=%2236%22 font-size=%2218%22 fill=%22white%22%3EPASS if green%3C/text%3E%3C/a%3E%3C/svg%3E'/>
  ",
)

#test(
  "5.06 nested SVG with onload on root",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIG9ubG9hZD0iTkVTVEVEX1JPT1RfT05MT0FEX0NBTkFSWSIgd2lkdGg9IjQyMCIgaGVpZ2h0PSIxMzAiPjxyZWN0IHdpZHRoPSI0MjAiIGhlaWdodD0iMTMwIiBmaWxsPSJncmVlbiIvPjwvc3ZnPg=='/>
  ",
)

#test(
  "5.07 nested data SVG recursion depth",
  "
  <image x='0' y='0' width='420' height='130'
    href='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22420%22 height=%22130%22%3E%3Cimage width=%22420%22 height=%22130%22 href=%22data:image/svg+xml,%253Csvg xmlns=%2522http://www.w3.org/2000/svg%2522 width=%2522420%2522 height=%2522130%2522%253E%253Crect width=%2522420%2522 height=%2522130%2522 fill=%2522red%2522/%253E%253Ctext x=%252214%2522 y=%252236%2522 font-size=%252218%2522 fill=%2522white%2522%253EFAIL nested depth%253C/text%253E%253C/svg%253E%22/%3E%3Crect width=%22420%22 height=%22130%22 fill=%22green%22/%3E%3Ctext x=%2214%22 y=%2236%22 font-size=%2218%22 fill=%22white%22%3EPASS if green%3C/text%3E%3C/svg%3E'/>
  ",
)

#section("6. Style attribute attacks")

#test(
  "6.01 url() comment obfuscation",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; background-image:u/**/rl(https://example.invalid/fail.png)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "6.02 @import comment obfuscation",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; @im/**/port url(https://example.invalid/fail.css)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "6.03 url() entity newline obfuscation",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; background-image:ur&#x0a;l(https://example.invalid/fail.png)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "6.04 @import entity tab obfuscation",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; @im&#x09;port url(https://example.invalid/fail.css)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "6.05 url() backslash escape",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; background-image:\\75rl(https://example.invalid/fail.png)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "6.06 url() hex CSS escape",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; background:\\000075rl(https://example.invalid/fail.png)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "6.07 style comment then url",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; /* */url(https://example.invalid/fail.png)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "6.08 expression() legacy IE",
  "
  <rect width='420' height='130' fill='green'
        style='fill:expression(EXPR_CANARY_SHOULD_BE_REMOVED)'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no EXPR_CANARY (inert in modern renderers)</text>
  ",
)

#test(
  "6.09 -moz-binding legacy",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; -moz-binding:url(https://example.invalid/fail.xml)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green (caught via url())</text>
  ",
)

#test(
  "6.10 behavior legacy IE",
  "
  <rect width='420' height='130' fill='green'
        style='fill:red; behavior:url(#FAIL)'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green (caught via url())</text>
  ",
)

#section("7. Animation (SMIL) attacks")

#test(
  "7.01 allowed visual animate fill",
  "
  <rect id='safe-anim-fill' width='420' height='130' fill='green'/>
  <animate xlink:href='#safe-anim-fill'
           attributeName='fill'
           values='green;blue;purple'
           dur='0.2s'
           fill='freeze'/>
  <text x='14' y='36' font-size='18' fill='white'>OK if green/blue/purple</text>
  ",
)

#test(
  "7.02 allowed animateTransform",
  "
  <rect x='20' y='55' width='40' height='40' fill='orange'>
    <animateTransform attributeName='transform'
                      type='translate'
                      from='0 0'
                      to='80 0'
                      dur='0.2s'
                      fill='freeze'/>
  </rect>
  <text x='14' y='36' font-size='18' fill='white'>OK if orange moves</text>
  ",
)

#test(
  "7.03 allowed animateMotion",
  "
  <circle cx='30' cy='80' r='16' fill='orange'>
    <animateMotion path='M0,0 L120,0'
                   dur='0.2s'
                   fill='freeze'/>
  </circle>
  <text x='14' y='36' font-size='18' fill='white'>OK if circle moves</text>
  ",
)

#test(
  "7.04 blocked animation href mutation",
  "
  <rect id='anim-href-target' width='420' height='130' fill='green'/>
  <animate xlink:href='#anim-href-target'
           attributeName='href'
           values='#safe;javascript:ANIM_HREF_CANARY'
           dur='0.01s'
           fill='freeze'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.05 blocked set style mutation",
  "
  <rect id='set-style-target' width='420' height='130' fill='green'/>
  <set xlink:href='#set-style-target'
       attributeName='style'
       to='fill:red'
       begin='0s'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.06 blocked animation class mutation",
  "
  <rect id='class-target' width='420' height='130' fill='green'/>
  <animate xlink:href='#class-target'
           attributeName='class'
           values='safe;ANIM_CLASS_CANARY'
           dur='0.01s'
           fill='freeze'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.07 blocked dangerous animation values javascript",
  "
  <rect id='anim-value-target' width='420' height='130' fill='green'/>
  <animate xlink:href='#anim-value-target'
           attributeName='fill'
           values='green;javascript:ANIM_VALUE_JS_CANARY'
           dur='0.01s'
           fill='freeze'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.08 blocked file animation values",
  "
  <rect id='anim-file-target' width='420' height='130' fill='green'/>
  <animate xlink:href='#anim-file-target'
           attributeName='fill'
           values='green;file:///ANIM_VALUE_FILE_CANARY'
           dur='0.01s'
           fill='freeze'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.09 animation attribute target whitespace",
  "
  <rect id='anim-ws' width='420' height='130' fill='green'/>
  <animate xlink:href='#anim-ws'
           attributeName='  href  '
           values='#a;javascript:ANIM_TARGET_WS_CANARY'
           dur='0.01s'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.10 animation attribute target via entity",
  "
  <rect id='anim-ent' width='420' height='130' fill='green'/>
  <animate xlink:href='#anim-ent'
           attributeName='hre&#x66;'
           values='#a;javascript:ANIM_TARGET_ENT_CANARY'
           dur='0.01s'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.11 animation values whitespace before protocol",
  "
  <rect id='anim-vws' width='420' height='130' fill='green'/>
  <animate xlink:href='#anim-vws'
           attributeName='fill'
           values='green;  javascript:ANIM_VAL_WS_CANARY'
           dur='0.01s'/>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.12 animation values url ref then javascript",
  "
  <rect id='anim-mixed' width='420' height='130' fill='green'>
    <animate attributeName='fill'
             values='green;url(#x);javascript:ANIM_MIXED_CANARY'
             dur='0.01s'/>
  </rect>
  <text x='14' y='36' font-size='18' fill='white'>PASS if green</text>
  ",
)

#test(
  "7.13 animation begin event trigger",
  "
  <rect id='anim-begin' width='420' height='130' fill='green'>
    <set attributeName='fill' to='red' begin='ANIM_BEGIN_CANARY.click'/>
  </rect>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: review begin attr (gap if event-based syntax remains)</text>
  ",
)

#section("8. Block-level tags")

#test(
  "8.01 iframe block",
  "
  <iframe x='0' y='0' width='420' height='130'
    srcdoc='&lt;body style=&quot;margin:0;background:red;color:white;font-size:28px&quot;&gt;FAIL iframe&lt;/body&gt;'>
  </iframe>
  ",
)

#test(
  "8.02 object block",
  "
  <object x='0' y='0' width='420' height='130'
    data='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22420%22 height=%22130%22%3E%3Crect width=%22420%22 height=%22130%22 fill=%22red%22/%3E%3Ctext x=%2214%22 y=%2270%22 font-size=%2228%22 fill=%22white%22%3EFAIL object%3C/text%3E%3C/svg%3E'>
  </object>
  ",
)

#test(
  "8.03 embed block",
  "
  <embed x='0' y='0' width='420' height='130'
    src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22420%22 height=%22130%22%3E%3Crect width=%22420%22 height=%22130%22 fill=%22red%22/%3E%3Ctext x=%2214%22 y=%2270%22 font-size=%2228%22 fill=%22white%22%3EFAIL embed%3C/text%3E%3C/svg%3E'/>
  ",
)

#test(
  "8.04 base href hijack",
  "
  <base href='javascript:BASE_HIJACK_CANARY'/>
  <a href='whatever'>
    <text x='14' y='82' font-size='14' fill='white'>Inspect output: no base, no BASE_HIJACK_CANARY</text>
  </a>
  ",
)

#test(
  "8.05 meta refresh",
  "
  <meta http-equiv='refresh' content='0;url=javascript:META_REFRESH_CANARY'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no meta, no META_REFRESH_CANARY</text>
  ",
)

#test(
  "8.06 link stylesheet",
  "
  <link rel='stylesheet' href='https://example.invalid/fail.css'/>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no link element</text>
  ",
)

#test(
  "8.07 srcdoc attr block",
  "
  <foreignObject x='0' y='0' width='420' height='130'>
    <iframe xmlns='http://www.w3.org/1999/xhtml'
      width='420'
      height='130'
      srcdoc='&lt;body style=&quot;margin:0;background:red;color:white;font-size:28px&quot;&gt;FAIL srcdoc&lt;/body&gt;'>
    </iframe>
  </foreignObject>
  ",
)

#section("9. foreignObject HTML content")

#test(
  "9.01 event attrs stripped",
  "
  <foreignObject x='0' y='0' width='420' height='130'>
    <body xmlns='http://www.w3.org/1999/xhtml'
          style='margin:0;background:green;color:white;font:18px sans-serif'>
      <div onclick='FOREIGN_EVENT_CANARY'
           onmouseover='FOREIGN_EVENT_CANARY'
           style='padding:14px'>PASS if green; inspect no FOREIGN_EVENT_CANARY</div>
    </body>
  </foreignObject>
  ",
)

#test(
  "9.02 unsafe style url",
  "
  <foreignObject x='0' y='0' width='420' height='130'>
    <body xmlns='http://www.w3.org/1999/xhtml'
          style='margin:0;background:green;color:white;font:18px sans-serif'>
      <div style='height:130px;background:red;background-image:url(https://example.invalid/fail.png)'>
        FAIL if red
      </div>
    </body>
  </foreignObject>
  ",
)

#test(
  "9.03 img onerror",
  "
  <foreignObject width='420' height='130'>
    <img xmlns='http://www.w3.org/1999/xhtml' src='x' onerror='FOREIGN_IMG_CANARY'/>
  </foreignObject>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no FOREIGN_IMG_CANARY</text>
  ",
)

#test(
  "9.04 form action javascript",
  "
  <foreignObject width='420' height='130'>
    <form xmlns='http://www.w3.org/1999/xhtml' action='javascript:FOREIGN_FORM_CANARY'>
      <input formaction='javascript:FOREIGN_FORM_CANARY'/>
    </form>
  </foreignObject>
  <text x='14' y='82' font-size='14' fill='white'>Inspect output: no FOREIGN_FORM_CANARY (input may render, neutered)</text>
  ",
)

#section("10. SVG-specific URL reference attributes")

#test(
  "10.01 filter external url",
  "
  <rect width='420' height='130' fill='green' filter='url(https://example.invalid/fail.svg#f)'/>
  <text x='14' y='82' font-size='14' fill='white'>Note: filter attr not URL-checked currently (gap)</text>
  ",
)

#test(
  "10.02 clip-path external url",
  "
  <rect width='420' height='130' fill='green' clip-path='url(https://example.invalid/fail.svg#c)'/>
  <text x='14' y='82' font-size='14' fill='white'>Note: clip-path attr not URL-checked currently (gap)</text>
  ",
)

#test(
  "10.03 mask external url",
  "
  <rect width='420' height='130' fill='green' mask='url(https://example.invalid/fail.svg#m)'/>
  <text x='14' y='82' font-size='14' fill='white'>Note: mask attr not URL-checked currently (gap)</text>
  ",
)

#test(
  "10.04 fill paint url external",
  "
  <rect width='420' height='130' fill='url(https://example.invalid/fail.svg#paint)'/>
  <text x='14' y='82' font-size='14' fill='white'>Note: fill paint url not checked (gap)</text>
  ",
)