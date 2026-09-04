import unittest
from statistics_verifier import verify_simpsons_paradox
from message_helper import _USER_MESSAGES, user_message

class TestSimpsonsParadoxVerifier(unittest.TestCase):
    def test_true_paradox(self):
        # Genuine Simpson's paradox: Women > Men in both subgroups, but Men > Women overall due to weights
        # Subgroup 1: Men 10/20 (50%), Women 40/50 (80%) -> Women > Men
        # Subgroup 2: Men 90/100 (90%), Women 19/20 (95%) -> Women > Men
        # Overall: Men 100/120 (83.33%), Women 59/70 (84.29%) -> Let's use clean numbers:
        # Charig: Small stones Men(A)=81/87(93.1%), Women(B)=234/270(86.7%) -> A > B
        # Large stones Men(A)=192/263(73.0%), Women(B)=55/80(68.8%) -> A > B
        # Aggregate Men(A)=273/350(78.0%), Women(B)=289/350(82.6%) -> B > A
        data = {
            "subgroups": [
                {"men_success": 81, "men_total": 87, "women_success": 234, "women_total": 270},
                {"men_success": 192, "men_total": 263, "women_success": 55, "women_total": 80}
            ]
        }
        res = verify_simpsons_paradox(data)
        self.assertFalse(res["verified"])  # Unclaimed paradox returns verified: False
        self.assertEqual(res["status"], "SIMSONS_PARADOX_TRUE")
        self.assertTrue(res["paradox_present"])
        self.assertTrue(res["defining_reversal_met"])

    def test_false_paradox_given_dataset(self):
        data = {
            "subgroups": [
                {"men_success": 80, "men_total": 100, "women_success": 20, "women_total": 50},
                {"men_success": 19, "men_total": 20, "women_success": 9, "women_total": 30}
            ]
        }
        res = verify_simpsons_paradox(data)
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "SIMSONS_PARADOX_FALSE")

    def test_equal_rates(self):
        data = {
            "subgroups": [
                {"men_success": 50, "men_total": 100, "women_success": 50, "women_total": 100},
                {"men_success": 30, "men_total": 100, "women_success": 20, "women_total": 100}
            ]
        }
        res = verify_simpsons_paradox(data)
        self.assertEqual(res["status"], "EQUAL_RATES")

    def test_insufficient_data(self):
        data = {
            "subgroups": [
                {"men_success": 0, "men_total": 0, "women_success": 10, "women_total": 20}
            ]
        }
        res = verify_simpsons_paradox(data)
        self.assertEqual(res["status"], "INSUFFICIENT_DATA")

    def test_general_reasoning_invalid_flag(self):
        data = {
            "subgroups": [
                {"men_success": 80, "men_total": 100, "women_success": 20, "women_total": 50},
                {"men_success": 19, "men_total": 20, "women_success": 9, "women_total": 30}
            ],
            "general_reasoning_invalid": True
        }
        res = verify_simpsons_paradox(data)
        expected_prefix = _USER_MESSAGES["GENERAL_REASONING_INVALID"]
        self.assertTrue(res["user_message"].startswith(expected_prefix))

    # =========================================================================
    # User-Specified Adversarial & Regression Cases A, B, C, D
    # =========================================================================

    def test_case_a_false_positive_stone_dataset_no_reversal(self):
        """Case A: Small stones (A: 93/100, B: 87/100), Large stones (A: 192/300, B: 55/100).
        Aggregate: A: 285/400 = 71.25%, B: 142/200 = 71.00%.
        A > B everywhere. NO reversal -> Simpson's paradox is ABSENT.
        If claimed as paradox, must flag FALSE_POSITIVE_PHENOMENON.
        """
        data = {
            "subgroups": [
                {"a_success": 93, "a_total": 100, "b_success": 87, "b_total": 100},
                {"a_success": 192, "a_total": 300, "b_success": 55, "b_total": 100}
            ],
            "claimed_paradox": True
        }
        res = verify_simpsons_paradox(data)
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "FALSE_POSITIVE_PHENOMENON")
        self.assertFalse(res["defining_reversal_met"])
        self.assertTrue(res["enabling_conditions_met"])  # unequal weights exist
        self.assertEqual(res["subgroup_direction"], "MEN>WOMEN")
        self.assertEqual(res["aggregate_direction"], "MEN>WOMEN")

        # When evaluated objectively without false claim:
        data_unclaimed = {
            "subgroups": [
                {"a_success": 93, "a_total": 100, "b_success": 87, "b_total": 100},
                {"a_success": 192, "a_total": 300, "b_success": 55, "b_total": 100}
            ]
        }
        res_unclaimed = verify_simpsons_paradox(data_unclaimed)
        self.assertTrue(res_unclaimed["verified"])
        self.assertEqual(res_unclaimed["status"], "SIMSONS_PARADOX_FALSE")
        self.assertFalse(res_unclaimed["paradox_present"])

    def test_case_b_genuine_simpsons_paradox_with_actual_reversal(self):
        """Case B: Genuine Simpson's paradox dataset with an actual reversal.
        Treatment A vs Treatment B on Kidney Stones (Charig et al. 1986):
        Small stones: A: 81/87 (93.1%), B: 234/270 (86.7%) -> A > B
        Large stones: A: 192/263 (73.0%), B: 55/80 (68.8%) -> A > B
        Overall: A: 273/350 (78.0%), B: 289/350 (82.6%) -> B > A (REVERSAL!)
        """
        data = {
            "subgroups": [
                {"a_success": 81, "a_total": 87, "b_success": 234, "b_total": 270},
                {"a_success": 192, "a_total": 263, "b_success": 55, "b_total": 80}
            ],
            "claimed_paradox": True
        }
        res = verify_simpsons_paradox(data)
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "SIMSONS_PARADOX_TRUE")
        self.assertTrue(res["paradox_present"])
        self.assertTrue(res["defining_reversal_met"])
        self.assertTrue(res["enabling_conditions_met"])
        self.assertEqual(res["subgroup_direction"], "MEN>WOMEN")
        self.assertEqual(res["aggregate_direction"], "WOMEN>MEN")

    def test_case_c_unequal_subgroup_distributions_no_reversal(self):
        """Case C: Heavily skewed subgroup distributions and weights, but NO reversal.
        Group 1: A: 900/1000 (90%), B: 80/100 (80%) -> A > B
        Group 2: A: 50/100 (50%), B: 400/1000 (40%) -> A > B
        Overall: A: 950/1100 (86.36%), B: 480/1100 (43.64%) -> A > B
        Enabling conditions (severe weight asymmetry 1000 vs 100) present, but no reversal.
        Must NOT identify Simpson's paradox.
        """
        data = {
            "subgroups": [
                {"group_a_success": 900, "group_a_total": 1000, "group_b_success": 80, "group_b_total": 100},
                {"group_a_success": 50, "group_a_total": 100, "group_b_success": 400, "group_b_total": 1000}
            ],
            "claimed_paradox": True
        }
        res = verify_simpsons_paradox(data)
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "FALSE_POSITIVE_PHENOMENON")
        self.assertFalse(res["paradox_present"])
        self.assertTrue(res["enabling_conditions_met"])
        self.assertFalse(res["defining_reversal_met"])

    def test_case_d_reversal_distinguishes_phenomenon_from_context(self):
        """Case D: Distinguishes whether the reversal legitimately demonstrates
        the phenomenon vs when claimed incorrectly.
        Subgroup 1: Treatment: 10/20 (50%), Control: 8/20 (40%) -> Treatment > Control
        Subgroup 2: Treatment: 30/100 (30%), Control: 10/50 (20%) -> Treatment > Control
        Aggregate: Treatment: 40/120 (33.33%), Control: 18/70 (25.71%) -> Treatment > Control
        No reversal occurs -> Simpson's paradox must NOT be identified.
        """
        data = {
            "subgroups": [
                {"treatment_success": 10, "treatment_total": 20, "control_success": 8, "control_total": 20},
                {"treatment_success": 30, "treatment_total": 100, "control_success": 10, "control_total": 50}
            ]
        }
        res = verify_simpsons_paradox(data)
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "SIMSONS_PARADOX_FALSE")
        self.assertFalse(res["paradox_present"])

    def test_mixed_subgroups_with_stated_premise_contradiction(self):
        """Engineering: X=80/100 (80%), Y=70/100 (70%) -> X > Y
        Humanities: X=20/100 (20%), Y=18/30 (60%) -> Y > X
        Aggregate: X=100/200 (50%), Y=88/130 (67.7%) -> Y > X
        Prompt asserts: "Within both programs, Program X has the higher admission rate."
        This is an explicit premise contradicted by the Humanities data!
        Must flag PREMISE_DATA_CONTRADICTION.
        """
        data = {
            "subgroups": [
                {"a_success": 80, "a_total": 100, "b_success": 70, "b_total": 100},
                {"a_success": 20, "a_total": 100, "b_success": 18, "b_total": 30}
            ],
            "stated_subgroup_direction": "X>Y in both",
            "claimed_paradox": True
        }
        res = verify_simpsons_paradox(data)
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "PREMISE_DATA_CONTRADICTION")
        self.assertFalse(res["paradox_present"])
        self.assertEqual(res["violating_subgroups"], [2])
        self.assertIn("Premise contradiction", res["user_message"])

    def test_mixed_subgroups_claimed_paradox_rejected(self):
        """Mixed subgroup directions without stated premise, but claiming Simpson's paradox:
        Subgroup 1: A > B, Subgroup 2: B > A.
        Cannot be Simpson's paradox because subgroups do not share a uniform direction to reverse!
        Must reject as FALSE_POSITIVE_PHENOMENON.
        """
        data = {
            "subgroups": [
                {"a_success": 80, "a_total": 100, "b_success": 70, "b_total": 100},
                {"a_success": 20, "a_total": 100, "b_success": 18, "b_total": 30}
            ],
            "claimed_paradox": True
        }
        res = verify_simpsons_paradox(data)
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "FALSE_POSITIVE_PHENOMENON")
        self.assertFalse(res["paradox_present"])
        self.assertFalse(res["defining_reversal_met"])
        self.assertEqual(res["subgroup_direction"], "MIXED")

if __name__ == "__main__":
    unittest.main(verbosity=2)

