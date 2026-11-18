# Contributing

New and changed code follows these rules. Please check your changes against
them before opening a pull request.

## Code Style

- Lines are at most 79 characters. Long literals like hex test vectors,
    payment requests or addresses can be longer: put them in module constants
    so the rest of the code stays short.
- Requires and constants are sorted by name, ignoring case.
- Library code has a single block of constants after the requires. Helpers
    in it are one line functions, and longer logic goes in the method itself.
- Constants in the same block never reference each other, helpers included.
    Repeat the value or use the global instead, duplication is fine:

    ```js
    const isNonce = n => Buffer.isBuffer(n) && n.length === 66;
    ```

    In tests, a constant that others use can also go in its own block above:

    ```js
    const port = 2348;

    const socket = `localhost:${port}`;
    ```

- A boolean expression never wraps onto a second line. Use early returns or
    a local variable so that each check fits on one line.
- Avoid nesting. Library code is never indented deeper than 12 spaces, and
    test code never deeper than 10. Flatten by splitting work into more
    `asyncAuto` steps, returning early or naming a small helper.
- Avoid busy nested calls, like a `map` that calls a function and picks a
    property inside a returned object. Give that work its own step or variable.
- Prefer functional loops like `forEach`, `map`, `filter` and `reduce` over
    `for` and `while` loops.
- Use `n` only as the parameter of a closure with a one line body. A closure
    with a longer body gets a descriptive parameter name like `utxo`.
- Never name a variable `length`. Use a name like `utxosCount`.
- State lives inside `asyncAuto` steps, not in variables declared outside of
    them. A step returns what later steps need.
- Comments are one line `//` comments. JSDoc blocks are the exception.

## Markdown

- The second and later lines of a bullet are indented 4 spaces, including
    paragraphs and code blocks that belong to the bullet.

## Tests

Run the unit tests with `npm test`. The integration tests need Docker and run
with `npm run integration-tests`.

Every unit test case goes in the `tests` array of its file, and there is one
small runner at the bottom of the file:

```js
tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got error');
    } else {
      deepEqual(await method(args), expected, 'Got expected result');
    }

    return;
  });
});
```

There are no other `test` calls or runners. Setup goes in helpers above the
tests. Side effects like pushes to a service or ended signing sessions are
part of `expected`: a helper returns them along with the result or the
error, and fakes keep their own records as properties like `service.pushes`.
