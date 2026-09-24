# Web repository module

- Owns Repository/Issue presentation and HTTP projection; Repository identity/access and Issue lifecycle remain in `@line-work/repository`.
- Do not use Task or Team as aliases for Repository/Issue. Team membership is not Repository access authority.
- Preserve request replay, expected-version conflict, current access recheck and unknown-result retry semantics.
- Project planning references Issues through Project contracts; this module never turns Project metadata into Issue truth.
