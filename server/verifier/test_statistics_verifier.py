import unittest
from statistics_verifier import verify_simpsons_paradox
from message_helper import _USER_MESSAGES, user_message

class TestSimpsonsParadoxVerifier(unittest.TestCase):
    def test_true_paradox(self):
        data = {
            "subgroups": [
                {"men_success": 30, "men_total": 100, "women_success": 80, "women_total": 100},
                {"men_success": 90, "men_total": 100, "women_success": 20, "women_total": 100}
            ]
        }
        res = verify_simpsons_paradox(data)
        self.assertFalse(res["verified"])  # paradox means not all same direction
        self.assertEqual(res["status"], "SIMSONS_PARADOX_TRUE")

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

if __name__ == "__main__":
    unittest.main(verbosity=2)
