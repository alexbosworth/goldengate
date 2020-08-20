const isSwapScriptV1 = require('./is_swap_script_v1');
const isSwapScriptV2 = require('./is_swap_script_v2');

/** Determine the version of a swap script

  If the script is not a swap script, version will be undefined

  {
    script: <Witness Script Hex String>
  }

  @throws
  <Error>

  @returns
  {
    [version]: <Version Number>
  }
*/
module.exports = ({script}) => {
  if (!script) {
    throw new Error('ExpectedScriptToDetermineSwapScriptVersion');
  }

  if (isSwapScriptV1({script})) {
    return {version: 1};
  }

  if (isSwapScriptV2({script})) {
    return {version: 2};
  }

  return {};
};
