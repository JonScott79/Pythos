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

if __name__ == "__main__":
    unittest.main(verbosity=2)
