Table 3. Robustness of the pre-registered expected results (synthetic learners). EXP-S: one-at-a-time settings (default plus each ranged learner parameter at its low and high value; N = 300, 10 seeds; explanation metrics on 3 seeds). A result holds when the seed-paired mean difference has the predicted sign and its 95% t-interval excludes 0.

| expected result | statement | holds in main run | holds in EXP-S settings | settings where it does not hold |
|---|---|---|---|---|
| K1 | On reward decisions, DN is higher for v2 than for v1. | yes | 39 of 39 | none |
| K2 | At sigma_n = 0.10, ST_exact on reward decisions is higher with delta_tie = 0.2 than with delta_tie = 0. | no | 0 of 39 | default, sigma_theta=low, sigma_theta=high, E_star_mean=low, E_star_mean=high, s_D=low, s_D=high, guess=low, guess=high, slip=low, slip=high, sigma_rt=low, sigma_rt=high, lambda_d=low, lambda_d=high, dk_scale=low, dk_scale=high, l_p=low, l_p=high, l_r=low, l_r=high, rho=low, rho=high, rho_s=low, rho_s=high, phi_flow=low, phi_flow=high, phi_bore=low, phi_bore=high, phi_frus=low, phi_frus=high, band_shift=low, band_shift=high, q_max=low, q_max=high, grader_error=low, grader_error=high, gain_scale=low, gain_scale=high |
| K3 | In S1 and S2, the final REG_fixed of TS_DEPLOYED is lower than that of RANDOM. | yes | 39 of 39 | none |
| K4 | RTS is higher in C4 than in C3. | yes | 39 of 39 | none |
